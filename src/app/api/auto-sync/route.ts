import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { parseBracketData } from '@/lib/bracketData';
import { fetchGroupStandings } from '@/lib/espnSync';
import { generateKnockoutBracket } from '@/lib/knockoutBracket';
import { isGroupStageComplete } from '@/lib/bestThirdPlace';
import { computeLiveStandings } from '@/lib/liveStandings';
import { rankThirdPlaceCandidates } from '@/lib/groupOrder';
import type { GroupStageResults, TournamentResults } from '@/types';

const EXPECTED_GROUPS = 12;

export async function GET(request: Request) {
  const user = getAuthUser(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM tournaments ORDER BY year DESC LIMIT 1',
  ).get() as { id: string; bracket_data: string; results_data: string | null } | undefined;

  if (!row) {
    return NextResponse.json({ ok: false, error: 'No tournament found' }, { status: 404 });
  }

  const bracketData = parseBracketData(row.bracket_data);
  if (!bracketData.groups?.length) {
    return NextResponse.json({ ok: false, error: 'Tournament has no bracket data' }, { status: 400 });
  }

  const existingResults: TournamentResults = row.results_data
    ? JSON.parse(row.results_data)
    : {};

  if (existingResults.groupStage) {
    return NextResponse.json({
      ok: false,
      error: 'Group stage results already saved. Clear them first to re-sync.',
    }, { status: 400 });
  }

  const groupTables = await fetchGroupStandings(bracketData);
  if (groupTables.length !== EXPECTED_GROUPS) {
    return NextResponse.json({
      ok: false,
      error: `Expected ${EXPECTED_GROUPS} groups from ESPN, got ${groupTables.length}`,
      partial: groupTables.map((g) => g.groupName),
    }, { status: 400 });
  }

  if (!isGroupStageComplete(groupTables)) {
    const incomplete = groupTables
      .filter((gt) => gt.standings.some((s) => s.gamesPlayed < 3))
      .map((gt) => gt.groupName);
    return NextResponse.json({
      ok: false,
      error: 'Group stage not yet complete',
      incompleteGroups: incomplete,
    }, { status: 400 });
  }

  // Build GroupStageResults using our canonical 2026 FIFA tiebreaker chain
  // (computed from results_data.groupMatches, NOT ESPN's standings order).
  const existingMatches = (existingResults as TournamentResults & {
    groupMatches?: Record<string, Array<{ teamA: string; teamB: string; scoreA: number; scoreB: number; cardEvents?: Array<{ teamId: number; athleteId: number; kind: 'yellow' | 'red' }> }>>;
  }).groupMatches ?? {};
  const liveTables = computeLiveStandings(bracketData, existingMatches, {});
  if (liveTables.length !== EXPECTED_GROUPS || liveTables.some((t) => t.standings.length !== 4)) {
    return NextResponse.json({
      ok: false,
      error: 'Could not compute final standings — missing match data',
    }, { status: 400 });
  }
  const groupResults = liveTables.map((gt) => ({
    groupName: gt.groupName,
    order: gt.standings.map((s) => s.team) as [string, string, string, string],
  }));

  const teamRank = (team: string) => {
    for (const g of bracketData.groups) {
      const t = g.teams.find((x) => x.name === team);
      if (t) return t.fifaRanking ?? 9999;
    }
    return 9999;
  };
  const advancingThirdPlace = rankThirdPlaceCandidates(
    liveTables.map((t) => t.standings[2]).map((s) => ({
      team: s.team, points: s.points, goalDifference: s.goalDifference,
      goalsFor: s.goalsFor, fairPlay: s.fairPlay,
    })),
    teamRank,
  ).slice(0, 8).map((c) => c.team);

  const gsResults: GroupStageResults = { groupResults, advancingThirdPlace };
  const knockoutBracket = generateKnockoutBracket(gsResults, bracketData);

  const updatedResults: TournamentResults = {
    ...existingResults,
    groupStage: gsResults,
    knockoutBracket,
  };

  db.prepare('UPDATE tournaments SET results_data = ? WHERE id = ?').run(
    JSON.stringify(updatedResults),
    row.id,
  );

  return NextResponse.json({
    ok: true,
    results: updatedResults,
    advancingThirdPlace,
  });
}

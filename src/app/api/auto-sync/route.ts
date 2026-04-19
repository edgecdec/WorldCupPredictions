import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { parseBracketData } from '@/lib/bracketData';
import { fetchGroupStandings } from '@/lib/espnSync';
import { generateKnockoutBracket } from '@/lib/knockoutBracket';
import { determineBestThirdPlace, isGroupStageComplete } from '@/lib/bestThirdPlace';
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

  // Build GroupStageResults from ESPN standings order
  const groupResults = groupTables.map((gt) => ({
    groupName: gt.groupName,
    order: gt.standings.map((s) => s.team) as [string, string, string, string],
  }));

  const advancingThirdPlace = determineBestThirdPlace(groupTables);

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

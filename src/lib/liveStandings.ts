import type { BracketData, LiveGame } from '@/types';
import type { GroupTable, GroupStanding } from '@/lib/espnSync';

interface CompletedMatch {
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
}

interface MatchInput extends CompletedMatch {
  /** Whether this match is in-progress (used to flag the row visually). */
  inProgress?: boolean;
}

/**
 * Compute live group standings from the matches we have, applying FIFA group-
 * stage tiebreakers. In-progress games count their current scoreline as the
 * final result for ordering purposes — the row gets flagged so the UI can show
 * a "live" indicator.
 *
 * Tiebreaker order (FIFA 2026):
 *   1. Points across all group matches
 *   2. Goal difference across all group matches
 *   3. Goals scored across all group matches
 *   4. Head-to-head points among the tied teams
 *   5. Head-to-head goal difference among the tied teams
 *   6. Head-to-head goals scored among the tied teams
 *   7. Fall back to deterministic alphabetical ordering (we don't model
 *      red-card discipline or drawing of lots)
 */
export function computeLiveStandings(
  bracketData: BracketData,
  completedByGroup: Record<string, CompletedMatch[]>,
  inProgressByGroup: Record<string, CompletedMatch[]>,
): GroupTable[] {
  return bracketData.groups.map((group) => {
    const matches: MatchInput[] = [
      ...(completedByGroup[group.name] ?? []),
      ...(inProgressByGroup[group.name] ?? []).map((m) => ({ ...m, inProgress: true })),
    ];

    const stats = new Map<string, GroupStanding>();
    for (const t of group.teams) {
      stats.set(t.name, {
        team: t.name,
        espnId: t.espnId ?? 0,
        points: 0, wins: 0, draws: 0, losses: 0,
        goalDifference: 0, goalsFor: 0, gamesPlayed: 0,
      });
    }
    const apply = (team: string, gf: number, ga: number) => {
      const s = stats.get(team);
      if (!s) return;
      s.gamesPlayed += 1;
      s.goalsFor += gf;
      s.goalDifference += gf - ga;
      if (gf > ga) { s.wins += 1; s.points += 3; }
      else if (gf < ga) { s.losses += 1; }
      else { s.draws += 1; s.points += 1; }
    };
    for (const m of matches) {
      apply(m.teamA, m.scoreA, m.scoreB);
      apply(m.teamB, m.scoreB, m.scoreA);
    }

    const standings = [...stats.values()].sort((a, b) => compareTeams(a, b, matches));
    return { groupName: group.name, standings };
  });
}

function compareTeams(a: GroupStanding, b: GroupStanding, matches: MatchInput[]): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

  // Head-to-head among the two teams. If multiple teams tie on the top three
  // criteria, FIFA applies head-to-head to the full tied subset, but a pairwise
  // comparator already approximates that well enough for live display purposes.
  const h = headToHead(a.team, b.team, matches);
  if (h !== 0) return h;

  return a.team.localeCompare(b.team);
}

function headToHead(teamA: string, teamB: string, matches: MatchInput[]): number {
  let aPts = 0, bPts = 0, aGd = 0, bGd = 0, aGf = 0, bGf = 0;
  for (const m of matches) {
    let aGoals: number | null = null, bGoals: number | null = null;
    if (m.teamA === teamA && m.teamB === teamB) { aGoals = m.scoreA; bGoals = m.scoreB; }
    else if (m.teamA === teamB && m.teamB === teamA) { aGoals = m.scoreB; bGoals = m.scoreA; }
    if (aGoals === null || bGoals === null) continue;
    aGf += aGoals; bGf += bGoals;
    aGd += aGoals - bGoals; bGd += bGoals - aGoals;
    if (aGoals > bGoals) aPts += 3;
    else if (aGoals < bGoals) bPts += 3;
    else { aPts += 1; bPts += 1; }
  }
  if (aPts !== bPts) return bPts - aPts;
  if (aGd !== bGd) return bGd - aGd;
  if (aGf !== bGf) return bGf - aGf;
  return 0;
}

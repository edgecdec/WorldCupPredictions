import type { BracketData } from '@/types';
import type { GroupTable, GroupStanding } from '@/lib/espnSync';
import {
  orderGroupTeams,
  fairPlayDeductionsForMatch,
  type CardEvent,
  type GroupMatch,
  type TeamRecord,
} from '@/lib/groupOrder';

interface CompletedMatch extends GroupMatch {
  cardEvents?: CardEvent[];
}

interface MatchInput extends CompletedMatch {
  /** Whether this match is in-progress (used to flag the row visually). */
  inProgress?: boolean;
}

export interface StandingWithFp extends GroupStanding {
  /** Fair Play points (always ≤ 0). Less negative is better. */
  fairPlay: number;
}

export interface GroupTableWithFp extends GroupTable {
  standings: StandingWithFp[];
}

/**
 * Compute live group standings using the canonical 2026 FIFA tiebreaker chain
 * (see lib/groupOrder.ts for the definition). In-progress games count their
 * current scoreline as the final result for ordering purposes.
 */
export function computeLiveStandings(
  bracketData: BracketData,
  completedByGroup: Record<string, CompletedMatch[]>,
  inProgressByGroup: Record<string, CompletedMatch[]>,
): GroupTableWithFp[] {
  return bracketData.groups.map((group) => {
    const matches: MatchInput[] = [
      ...(completedByGroup[group.name] ?? []),
      ...(inProgressByGroup[group.name] ?? []).map((m) => ({ ...m, inProgress: true })),
    ];

    const teamByEspnId = new Map<number, string>();
    for (const t of group.teams) {
      if (t.espnId) teamByEspnId.set(t.espnId, t.name);
    }

    const stats = new Map<string, StandingWithFp>();
    const fifaRanking = new Map<string, number>();
    for (const t of group.teams) {
      stats.set(t.name, {
        team: t.name,
        espnId: t.espnId ?? 0,
        points: 0, wins: 0, draws: 0, losses: 0,
        goalDifference: 0, goalsFor: 0, gamesPlayed: 0,
        fairPlay: 0,
      });
      fifaRanking.set(t.name, t.fifaRanking ?? 9999);
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
      for (const [team, deduction] of fairPlayDeductionsForMatch(m.cardEvents, teamByEspnId)) {
        const s = stats.get(team);
        if (s) s.fairPlay += deduction;
      }
    }

    // Build TeamRecord map for the canonical sorter.
    const recordMap = new Map<string, TeamRecord>();
    for (const [name, s] of stats) {
      recordMap.set(name, {
        team: name,
        points: s.points,
        goalDifference: s.goalDifference,
        goalsFor: s.goalsFor,
      });
    }
    const orderedNames = orderGroupTeams(
      group.teams.map((t) => t.name),
      recordMap,
      matches,
      (team) => stats.get(team)?.fairPlay ?? 0,
      (team) => fifaRanking.get(team) ?? 9999,
    );
    const ordered = orderedNames.map((n) => stats.get(n)!).filter(Boolean);
    return { groupName: group.name, standings: ordered };
  });
}

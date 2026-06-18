import type { BracketData } from '@/types';
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
 * 2026 FIFA World Cup group-stage tiebreakers (Article 13 of the WC26
 * Regulations, per FIFA's published explainer).
 *
 *   1. Points
 *   2. Head-to-head points among tied teams
 *   3. Head-to-head goal difference among tied teams
 *   4. Head-to-head goals scored among tied teams
 *   5. Overall (group-wide) goal difference
 *   6. Overall (group-wide) goals scored
 *   7. Fair Play / Team Conduct Score (not modelled — see note)
 *   8. FIFA/Coca-Cola Men's World Ranking
 *   9. (Final fallback we use for determinism — alphabetical)
 *
 * Important: H2H is applied to the **mini-table among the full set of tied
 * teams**, not pairwise. If 3 teams tie on points, we score them only on
 * matches between those 3, and if a subset of them is still tied after H2H
 * GD/GF, we recompute the mini-table on just that subset before falling
 * through to overall criteria.
 *
 * Fair Play (yellow=−1, 2nd yellow=−3, direct red=−4, yellow+red same
 * match=−5; one deduction per player per match, take the worst) is left for
 * a follow-up — we'd need to ingest card events from ESPN's match feed and
 * sum per-team. Until then we skip step 7 and break ties by FIFA ranking.
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
    const fifaRanking = new Map<string, number>();
    for (const t of group.teams) {
      stats.set(t.name, {
        team: t.name,
        espnId: t.espnId ?? 0,
        points: 0, wins: 0, draws: 0, losses: 0,
        goalDifference: 0, goalsFor: 0, gamesPlayed: 0,
      });
      // Lower fifaRanking = better team. Default to a large number if missing
      // so unranked teams sort last on the final fallback.
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
    }

    const ordered = orderTeams([...stats.values()], matches, fifaRanking);
    return { groupName: group.name, standings: ordered };
  });
}

/**
 * Group teams by points, then resolve each tied bucket with the mini-table
 * H2H tiebreaker chain. Uses recursion: within a tied bucket we re-bucket
 * by H2H points (computed against just the bucket members), then by H2H GD,
 * then H2H GF. If any sub-bucket still has ≥2 teams after H2H criteria, we
 * fall through to overall GD/GF, then FIFA ranking, then alphabetical.
 */
function orderTeams(
  teams: GroupStanding[],
  matches: MatchInput[],
  fifaRanking: Map<string, number>,
): GroupStanding[] {
  const buckets = bucketBy(teams, (t) => t.points);
  const out: GroupStanding[] = [];
  for (const bucket of buckets) {
    if (bucket.length === 1) { out.push(bucket[0]); continue; }
    out.push(...resolveTiedBucket(bucket, matches, fifaRanking));
  }
  return out;
}

function resolveTiedBucket(
  bucket: GroupStanding[],
  matches: MatchInput[],
  fifaRanking: Map<string, number>,
): GroupStanding[] {
  // H2H points among the bucket → split into sub-buckets in descending order.
  const subTable = miniTable(bucket.map((t) => t.team), matches);
  const byH2hPts = bucketBy(bucket, (t) => subTable.get(t.team)?.points ?? 0);
  const out: GroupStanding[] = [];
  for (const sub of byH2hPts) {
    if (sub.length === 1) { out.push(sub[0]); continue; }
    // H2H GD, then H2H GF, computed on the sub-bucket only.
    const subSub = miniTable(sub.map((t) => t.team), matches);
    const byH2hGd = bucketBy(sub, (t) => subSub.get(t.team)?.gd ?? 0);
    for (const ssg of byH2hGd) {
      if (ssg.length === 1) { out.push(ssg[0]); continue; }
      const subSubSub = miniTable(ssg.map((t) => t.team), matches);
      const byH2hGf = bucketBy(ssg, (t) => subSubSub.get(t.team)?.gf ?? 0);
      for (const sssg of byH2hGf) {
        if (sssg.length === 1) { out.push(sssg[0]); continue; }
        // H2H exhausted → overall criteria, then FIFA ranking, then alpha.
        sssg.sort((a, b) =>
          (b.goalDifference - a.goalDifference)
          || (b.goalsFor - a.goalsFor)
          || ((fifaRanking.get(a.team) ?? 9999) - (fifaRanking.get(b.team) ?? 9999))
          || a.team.localeCompare(b.team));
        out.push(...sssg);
      }
    }
  }
  return out;
}

/**
 * Build a mini-table among `teamSet`, using only matches where both teams
 * are members. Returns a map of team → { points, gd, gf }.
 */
function miniTable(
  teamSet: string[],
  matches: MatchInput[],
): Map<string, { points: number; gd: number; gf: number }> {
  const set = new Set(teamSet);
  const m = new Map<string, { points: number; gd: number; gf: number }>();
  for (const t of teamSet) m.set(t, { points: 0, gd: 0, gf: 0 });
  for (const match of matches) {
    if (!set.has(match.teamA) || !set.has(match.teamB)) continue;
    const a = m.get(match.teamA)!;
    const b = m.get(match.teamB)!;
    a.gf += match.scoreA;
    b.gf += match.scoreB;
    a.gd += match.scoreA - match.scoreB;
    b.gd += match.scoreB - match.scoreA;
    if (match.scoreA > match.scoreB) a.points += 3;
    else if (match.scoreA < match.scoreB) b.points += 3;
    else { a.points += 1; b.points += 1; }
  }
  return m;
}

/**
 * Sort `items` by `key` descending, then split into runs of equal key — i.e.
 * an array of buckets, where every bucket holds items sharing the same key.
 * Stable across calls because we sort once with a deterministic comparator.
 */
function bucketBy<T>(items: T[], key: (t: T) => number): T[][] {
  const sorted = [...items].sort((a, b) => key(b) - key(a));
  const out: T[][] = [];
  let current: T[] = [];
  let lastKey: number | null = null;
  for (const it of sorted) {
    const k = key(it);
    if (lastKey === null || k !== lastKey) {
      if (current.length > 0) out.push(current);
      current = [it];
      lastKey = k;
    } else {
      current.push(it);
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

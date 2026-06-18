import type { BracketData } from '@/types';
import type { GroupTable, GroupStanding } from '@/lib/espnSync';

interface CardEvent {
  teamId: number;
  athleteId: number;
  kind: 'yellow' | 'red';
}

interface CompletedMatch {
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
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
 * 2026 FIFA World Cup group-stage tiebreakers (Article 13 of the WC26
 * Regulations, per FIFA's published explainer).
 *
 *   1. Points
 *   2. Head-to-head points among tied teams
 *   3. Head-to-head goal difference among tied teams
 *   4. Head-to-head goals scored among tied teams
 *   5. Overall (group-wide) goal difference
 *   6. Overall (group-wide) goals scored
 *   7. Fair Play / Team Conduct Score (less-negative wins)
 *   8. FIFA/Coca-Cola Men's World Ranking
 *   9. Alphabetical fallback (deterministic)
 *
 * H2H is applied as a mini-table among the **full set of tied teams**, not
 * pairwise. If 3 teams tie on points, we score them on matches between just
 * those 3, then re-bucket on H2H pts → re-table within each new bucket on
 * H2H GD → H2H GF.
 *
 * Fair Play formula: each player gets at most one deduction per match (the
 * worst applicable):
 *   yellow only:                      -1
 *   2nd yellow same match (=2nd yc):  -3
 *   direct red:                       -4
 *   yellow + direct red same match:   -5
 * Team total = sum across all players in all matches. Higher (less negative)
 * is better.
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

    // espnId → team name lookup for attributing cards to teams.
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

      // Fair Play points: collapse per-(match, player) bookings to one
      // deduction (the worst), then add to the team's running total.
      for (const [team, deduction] of fairPlayDeductionsForMatch(m, teamByEspnId)) {
        const s = stats.get(team);
        if (s) s.fairPlay += deduction;
      }
    }

    const ordered = orderTeams([...stats.values()], matches, fifaRanking);
    return { groupName: group.name, standings: ordered };
  });
}

/**
 * For one match, return [teamName, deduction] pairs — one entry per player
 * who got carded. `deduction` is always negative.
 */
function fairPlayDeductionsForMatch(
  match: CompletedMatch,
  teamByEspnId: Map<number, string>,
): Array<[string, number]> {
  if (!match.cardEvents?.length) return [];
  // Aggregate per athlete in this match: counts of yellow + red.
  const perAthlete = new Map<number, { teamId: number; yellows: number; reds: number }>();
  for (const ev of match.cardEvents) {
    const acc = perAthlete.get(ev.athleteId) ?? { teamId: ev.teamId, yellows: 0, reds: 0 };
    if (ev.kind === 'yellow') acc.yellows++;
    else acc.reds++;
    perAthlete.set(ev.athleteId, acc);
  }
  const out: Array<[string, number]> = [];
  for (const { teamId, yellows, reds } of perAthlete.values()) {
    const team = teamByEspnId.get(teamId);
    if (!team) continue;
    let deduction = 0;
    if (reds > 0 && yellows > 0) deduction = -5;        // yellow + direct red same match
    else if (reds > 0) deduction = -4;                  // direct red only
    else if (yellows >= 2) deduction = -3;              // 2nd yellow (= sending off via 2 yc)
    else if (yellows === 1) deduction = -1;             // single yellow
    if (deduction !== 0) out.push([team, deduction]);
  }
  return out;
}

/**
 * Group teams by points, then resolve each tied bucket with the mini-table
 * H2H tiebreaker chain. After H2H exhausts, fall through to overall GD/GF,
 * Fair Play, FIFA ranking, then alphabetical.
 */
function orderTeams(
  teams: StandingWithFp[],
  matches: MatchInput[],
  fifaRanking: Map<string, number>,
): StandingWithFp[] {
  const buckets = bucketBy(teams, (t) => t.points);
  const out: StandingWithFp[] = [];
  for (const bucket of buckets) {
    if (bucket.length === 1) { out.push(bucket[0]); continue; }
    out.push(...resolveTiedBucket(bucket, matches, fifaRanking));
  }
  return out;
}

function resolveTiedBucket(
  bucket: StandingWithFp[],
  matches: MatchInput[],
  fifaRanking: Map<string, number>,
): StandingWithFp[] {
  const subTable = miniTable(bucket.map((t) => t.team), matches);
  const byH2hPts = bucketBy(bucket, (t) => subTable.get(t.team)?.points ?? 0);
  const out: StandingWithFp[] = [];
  for (const sub of byH2hPts) {
    if (sub.length === 1) { out.push(sub[0]); continue; }
    const subSub = miniTable(sub.map((t) => t.team), matches);
    const byH2hGd = bucketBy(sub, (t) => subSub.get(t.team)?.gd ?? 0);
    for (const ssg of byH2hGd) {
      if (ssg.length === 1) { out.push(ssg[0]); continue; }
      const subSubSub = miniTable(ssg.map((t) => t.team), matches);
      const byH2hGf = bucketBy(ssg, (t) => subSubSub.get(t.team)?.gf ?? 0);
      for (const sssg of byH2hGf) {
        if (sssg.length === 1) { out.push(sssg[0]); continue; }
        // H2H exhausted → overall GD → overall GF → Fair Play → FIFA rank → alpha.
        sssg.sort((a, b) =>
          (b.goalDifference - a.goalDifference)
          || (b.goalsFor - a.goalsFor)
          || (b.fairPlay - a.fairPlay)
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

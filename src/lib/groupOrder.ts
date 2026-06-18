// =============================================================================
// 2026 FIFA World Cup group-stage tiebreaker chain — single source of truth
// =============================================================================
//
// Used by Live Standings (UI), the tournament simulator worker, the autofill
// helper, the user-facing what-if simulator, and the final-standings writer
// in syncResults. Keep this file as the only implementation of the chain so
// every surface in the app produces the same finishing order from the same
// match data.
//
// Chain (FIFA Article 13, WC26 Regulations):
//   1. Points
//   2. Head-to-head points among tied teams (mini-table on tied subset)
//   3. Head-to-head goal difference
//   4. Head-to-head goals scored
//   5. Overall (group-wide) goal difference
//   6. Overall (group-wide) goals scored
//   7. Fair Play points (less negative is better; computed externally)
//   8. FIFA / Coca-Cola Men's Ranking (lower number = better team)
//   9. Alphabetical fallback (deterministic)
//
// Notes:
//   - Pure module: no DOM, no React, no `import.meta`, no I/O. Safe to import
//     from web workers and Node code paths alike.
//   - Steps 2–4 apply to the **mini-table on the full tied subset**, then
//     re-bucket and re-evaluate. If a sub-bucket is still tied after H2H GF,
//     fall through to the overall criteria 5–6.
//   - Fair Play: caller passes a per-team total. Sims that don't model card
//     rates can pass `() => 0` and step 7 becomes a no-op.

export interface GroupMatch {
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
}

export interface TeamRecord {
  team: string;
  points: number;
  goalDifference: number;
  goalsFor: number;
}

/**
 * Order a list of teams using the 2026 FIFA tiebreaker chain.
 *
 * @param teams        team names in this group (any order)
 * @param record       map of team → { points, goalDifference, goalsFor }
 *                     covering all matches the team has played in this group
 * @param matches      every group match played, used for H2H mini-tables
 * @param fairPlay     team → Fair Play points (≤ 0). Pass `() => 0` to skip.
 * @param fifaRanking  team → FIFA ranking (lower = better). Pass `() => 9999`
 *                     when ranking isn't available.
 */
export function orderGroupTeams(
  teams: string[],
  record: Map<string, TeamRecord>,
  matches: GroupMatch[],
  fairPlay: (team: string) => number,
  fifaRanking: (team: string) => number,
): string[] {
  const buckets = bucketBy(teams, (t) => record.get(t)?.points ?? 0);
  const out: string[] = [];
  for (const bucket of buckets) {
    if (bucket.length === 1) { out.push(bucket[0]); continue; }
    out.push(...resolveTied(bucket, record, matches, fairPlay, fifaRanking));
  }
  return out;
}

function resolveTied(
  bucket: string[],
  record: Map<string, TeamRecord>,
  matches: GroupMatch[],
  fairPlay: (team: string) => number,
  fifaRanking: (team: string) => number,
): string[] {
  const t1 = miniTable(bucket, matches);
  const out: string[] = [];
  for (const lvl1 of bucketBy(bucket, (t) => t1.get(t)?.points ?? 0)) {
    if (lvl1.length === 1) { out.push(lvl1[0]); continue; }
    const t2 = miniTable(lvl1, matches);
    for (const lvl2 of bucketBy(lvl1, (t) => t2.get(t)?.gd ?? 0)) {
      if (lvl2.length === 1) { out.push(lvl2[0]); continue; }
      const t3 = miniTable(lvl2, matches);
      for (const lvl3 of bucketBy(lvl2, (t) => t3.get(t)?.gf ?? 0)) {
        if (lvl3.length === 1) { out.push(lvl3[0]); continue; }
        // H2H exhausted → overall GD → overall GF → Fair Play → FIFA rank → alpha.
        lvl3.sort((a, b) => {
          const ra = record.get(a) ?? { team: a, points: 0, goalDifference: 0, goalsFor: 0 };
          const rb = record.get(b) ?? { team: b, points: 0, goalDifference: 0, goalsFor: 0 };
          return (rb.goalDifference - ra.goalDifference)
            || (rb.goalsFor - ra.goalsFor)
            || (fairPlay(b) - fairPlay(a))
            || (fifaRanking(a) - fifaRanking(b))
            || a.localeCompare(b);
        });
        out.push(...lvl3);
      }
    }
  }
  return out;
}

/** Build a mini-table among `set` using only matches where both teams are in set. */
function miniTable(set: string[], matches: GroupMatch[]): Map<string, { points: number; gd: number; gf: number }> {
  const inSet = new Set(set);
  const m = new Map<string, { points: number; gd: number; gf: number }>();
  for (const t of set) m.set(t, { points: 0, gd: 0, gf: 0 });
  for (const match of matches) {
    if (!inSet.has(match.teamA) || !inSet.has(match.teamB)) continue;
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

/** Sort items by `key` desc, then split into runs of equal key. */
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

/**
 * Compute Fair Play deductions for one match. Returns [team, deduction] pairs
 * (deduction always negative). Caller sums per-team across all matches.
 *
 *   yellow only:                    -1
 *   2nd yellow same match:          -3
 *   direct red:                     -4
 *   yellow + direct red same match: -5
 *
 * Each player gets at most one deduction per match (the worst applicable).
 */
export interface CardEvent {
  teamId: number;
  athleteId: number;
  kind: 'yellow' | 'red';
}

export function fairPlayDeductionsForMatch(
  cardEvents: CardEvent[] | undefined,
  teamByEspnId: Map<number, string>,
): Array<[string, number]> {
  if (!cardEvents?.length) return [];
  const perAthlete = new Map<number, { teamId: number; yellows: number; reds: number }>();
  for (const ev of cardEvents) {
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
    if (reds > 0 && yellows > 0) deduction = -5;
    else if (reds > 0) deduction = -4;
    else if (yellows >= 2) deduction = -3;
    else if (yellows === 1) deduction = -1;
    if (deduction !== 0) out.push([team, deduction]);
  }
  return out;
}

/**
 * Cross-group ordering used to pick the 8 best 3rd-place teams that advance.
 * H2H doesn't apply (these teams haven't played each other), so the chain is:
 *   pts → overall GD → overall GF → Fair Play → FIFA rank → alpha.
 */
export interface ThirdPlaceCandidate {
  team: string;
  points: number;
  goalDifference: number;
  goalsFor: number;
  fairPlay: number;
}

export function rankThirdPlaceCandidates(
  candidates: ThirdPlaceCandidate[],
  fifaRanking: (team: string) => number,
): ThirdPlaceCandidate[] {
  return [...candidates].sort((a, b) =>
    (b.points - a.points)
    || (b.goalDifference - a.goalDifference)
    || (b.goalsFor - a.goalsFor)
    || (b.fairPlay - a.fairPlay)
    || (fifaRanking(a.team) - fifaRanking(b.team))
    || a.team.localeCompare(b.team));
}

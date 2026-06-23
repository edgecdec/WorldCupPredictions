// =============================================================================
// Knockout slot probability rollup
// =============================================================================
//
// Given R32 slot team distributions (from the tournament sim's `groupOnly`
// mode), derive team-membership distributions for every other slot in the
// bracket — R16, QF, SF, 3rd-place, FINAL — by walking the FIFA feeder graph.
//
// We do NOT simulate knockout matches. The question this answers is "what
// teams could be in this slot" not "what teams will win their way to this
// slot." For the picker UI, that's the right model: the user is picking the
// slot, and they want to see which teams might fill it once teams flow
// through unchanged.
//
// Specifically: for an R16 slot whose feeder is R32-N-W (the winner of R32
// match N), the team distribution is the union of R32-N-A and R32-N-B —
// because either one could win that R32 match and advance. Probabilities
// represent "fraction of sims where this team was even in R32-N at all."
//
// Why union, not match-weighted: we never simulated the R32 match, so we
// have no probabilities of who wins it. A team that appears in R32-N-A
// 100% of sims is "100% likely to be in R32-N" — but its chance of winning
// R32-N depends on the opponent, which we don't model here. The picker UI
// only needs to communicate "these are the teams that could show up at this
// slot;" the win-probability question is irrelevant since the user already
// committed to the slot.
//
// One subtlety: the SAME team can appear in both feeders (different slots
// of the same R32 match) — we still want to show it as one chip, summing
// the per-feeder fractions but capping at 1.0 since "team X is in R32-N"
// is a single event whether X is on the A or B side.

// FIFA feeder graphs (indices are 0-based; FIFA match #s are 1-based).
const R16_FEEDS: Array<[number, number]> = [
  [1, 4], [0, 2], [3, 5], [6, 7],
  [10, 11], [8, 9], [13, 15], [12, 14],
];
const QF_FEEDS: Array<[number, number]> = [
  [0, 1], [4, 5], [2, 3], [6, 7],
];
const SF_FEEDS: Array<[number, number]> = [[0, 1], [2, 3]];

export interface SlotDistributions {
  /** Slot id ('R32-1-A', 'R16-1-A', 'QF-1-A', 'SF-1-A', '3RD-A', 'FINAL-A', etc.)
   *  → team → fraction of sims this team is in this slot (0..1). */
  bySlot: Record<string, Record<string, number>>;
}

/**
 * Derive R16/QF/SF/3rd/Final slot team distributions from R32 distributions.
 * Input is the worker's groupOnly output. Output covers EVERY slot in the
 * bracket including R32, so the picker can render any round uniformly.
 */
export function rollUpSlotProbabilities(
  r32Distributions: Record<string, Record<string, number>>,
): SlotDistributions {
  const bySlot: Record<string, Record<string, number>> = {};
  // R32 distributions pass through unchanged.
  for (const [slot, dist] of Object.entries(r32Distributions)) {
    bySlot[slot] = { ...dist };
  }

  // R32 "winner" of match N is just the union of N-A and N-B — every team
  // that's even *in* that match has a chance to come out of it.
  for (let i = 0; i < 16; i++) {
    bySlot[`R32-${i + 1}-W`] = unionDist(bySlot[`R32-${i + 1}-A`], bySlot[`R32-${i + 1}-B`]);
  }

  // R16 slot A/B teams are the winners of two R32 matches → already unioned.
  for (let i = 0; i < 8; i++) {
    const [aIdx, bIdx] = R16_FEEDS[i];
    bySlot[`R16-${i + 1}-A`] = { ...bySlot[`R32-${aIdx + 1}-W`] };
    bySlot[`R16-${i + 1}-B`] = { ...bySlot[`R32-${bIdx + 1}-W`] };
    bySlot[`R16-${i + 1}-W`] = unionDist(bySlot[`R16-${i + 1}-A`], bySlot[`R16-${i + 1}-B`]);
  }

  // QF
  for (let i = 0; i < 4; i++) {
    const [aIdx, bIdx] = QF_FEEDS[i];
    bySlot[`QF-${i + 1}-A`] = { ...bySlot[`R16-${aIdx + 1}-W`] };
    bySlot[`QF-${i + 1}-B`] = { ...bySlot[`R16-${bIdx + 1}-W`] };
    bySlot[`QF-${i + 1}-W`] = unionDist(bySlot[`QF-${i + 1}-A`], bySlot[`QF-${i + 1}-B`]);
  }

  // SF
  for (let i = 0; i < 2; i++) {
    const [aIdx, bIdx] = SF_FEEDS[i];
    bySlot[`SF-${i + 1}-A`] = { ...bySlot[`QF-${aIdx + 1}-W`] };
    bySlot[`SF-${i + 1}-B`] = { ...bySlot[`QF-${bIdx + 1}-W`] };
    bySlot[`SF-${i + 1}-W`] = unionDist(bySlot[`SF-${i + 1}-A`], bySlot[`SF-${i + 1}-B`]);
  }

  // 3rd place playoff: losers of the two SF matches. The team distribution
  // is the same as the SF-N-W distribution (a team that's "in SF-N" could
  // either win or lose it — we don't model which, so the candidate set is
  // identical). FINAL is the winners.
  bySlot[`3RD-A`] = { ...bySlot[`SF-1-W`] };
  bySlot[`3RD-B`] = { ...bySlot[`SF-2-W`] };
  bySlot[`3RD-W`] = unionDist(bySlot[`3RD-A`], bySlot[`3RD-B`]);
  bySlot[`FINAL-A`] = { ...bySlot[`SF-1-W`] };
  bySlot[`FINAL-B`] = { ...bySlot[`SF-2-W`] };
  bySlot[`FINAL-W`] = unionDist(bySlot[`FINAL-A`], bySlot[`FINAL-B`]);

  return { bySlot };
}

/**
 * Union of two distributions. For a team appearing in both feeders, the
 * combined probability of "being in either feeder slot" is at most the sum,
 * but bounded by 1.0. We add directly because the two feeders of any single
 * match are mutually exclusive within one sim (a team can't be on both
 * sides of the same match in the same simulation).
 */
function unionDist(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [team, p] of Object.entries(a ?? {})) out[team] = p;
  for (const [team, p] of Object.entries(b ?? {})) out[team] = (out[team] ?? 0) + p;
  // Clamp to 1.0 to absorb any floating-point bleed.
  for (const team of Object.keys(out)) {
    if (out[team] > 1) out[team] = 1;
  }
  return out;
}

/**
 * Format a slot's distribution into a list of ranked entries (team + pct),
 * sorted descending. Tiny probabilities are dropped to keep the chip strip
 * legible — pass `{ minPct: 0.01 }` for a 1% floor, `{ topN: 3 }` for top 3.
 */
export function rankSlotEntries(
  dist: Record<string, number> | undefined,
  opts: { minPct?: number; topN?: number } = {},
): Array<{ team: string; pct: number }> {
  if (!dist) return [];
  const entries = Object.entries(dist)
    .filter(([, p]) => p >= (opts.minPct ?? 0))
    .sort((a, b) => b[1] - a[1])
    .map(([team, pct]) => ({ team, pct }));
  return opts.topN ? entries.slice(0, opts.topN) : entries;
}

/**
 * Returns the single team filling a slot when the distribution has
 * collapsed to a single possibility (post-group-stage or any trivially
 * forced slot mid-stage), or null if multiple teams are still in play.
 *
 * Used to decide between "show full flag + name" (one possibility) vs
 * "show flags + %" (multiple).
 */
export function resolvedSlotTeam(dist: Record<string, number> | undefined): string | null {
  if (!dist) return null;
  const nonZero = Object.entries(dist).filter(([, p]) => p > 0);
  if (nonZero.length !== 1) return null;
  // Single team — sanity-check its probability is near 1.0 (allow floating
  // point fuzz). If it isn't, treat as unresolved so we don't display a
  // misleadingly confident single-team chip.
  const [team, p] = nonZero[0];
  return p > 0.999 ? team : null;
}

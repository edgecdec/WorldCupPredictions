// Web Worker for Monte Carlo knockout bracket simulation
// Self-contained — no imports (workers can't use path aliases)

interface MCEntry {
  key: string;
  picks: Record<string, string>;
}

interface SimRequest {
  entries: MCEntry[];
  results: Record<string, string>;
  hypo: Record<string, string>;
  matchups: Array<{ id: string; round: number; teamA: string | null; teamB: string | null }>;
  teamRankings: Record<string, number>;
  scoring: {
    pointsPerRound: number[];
    upsetMultiplierPerRound: number[];
    upsetModulus: number;
    championBonus: number;
  };
  totalSims: number;
}

interface SimResultMsg {
  type: 'progress' | 'done';
  progress?: number;
  results?: Array<{ key: string; avgScore: number; avgPlace: number; winPct: number }>;
}

// Feeder map: matchupId -> [feederA, feederB]
const R16_FEEDS: [string, string, string][] = [
  ['R16-1', 'R32-1', 'R32-2'], ['R16-2', 'R32-3', 'R32-4'],
  ['R16-3', 'R32-5', 'R32-6'], ['R16-4', 'R32-7', 'R32-8'],
  ['R16-5', 'R32-9', 'R32-10'], ['R16-6', 'R32-11', 'R32-12'],
  ['R16-7', 'R32-13', 'R32-14'], ['R16-8', 'R32-15', 'R32-16'],
];
const QF_FEEDS: [string, string, string][] = [
  ['QF-1', 'R16-1', 'R16-2'], ['QF-2', 'R16-3', 'R16-4'],
  ['QF-3', 'R16-5', 'R16-6'], ['QF-4', 'R16-7', 'R16-8'],
];
const SF_FEEDS: [string, string, string][] = [
  ['SF-1', 'QF-1', 'QF-2'], ['SF-2', 'QF-3', 'QF-4'],
];
const SPECIAL_FEEDS: [string, string, string][] = [
  ['3RD', 'SF-1', 'SF-2'], ['FINAL', 'SF-1', 'SF-2'],
];

const ALL_FEEDS = [...R16_FEEDS, ...QF_FEEDS, ...SF_FEEDS, ...SPECIAL_FEEDS];

function getFeeders(matchupId: string): [string, string] | null {
  for (const [id, a, b] of ALL_FEEDS) {
    if (id === matchupId) return [a, b];
  }
  return null;
}

function getRoundForId(id: string): number {
  if (id.startsWith('R32')) return 0;
  if (id.startsWith('R16')) return 1;
  if (id.startsWith('QF')) return 2;
  if (id.startsWith('SF')) return 3;
  if (id === '3RD') return 4;
  if (id === 'FINAL') return 5;
  return -1;
}

/** Win probability based on FIFA ranking difference using logistic model */
function winProb(rankA: number, rankB: number): number {
  if (rankA === rankB) return 0.5;
  // Lower ranking = better team. Positive diff means A is underdog.
  const diff = rankA - rankB;
  return 1 / (1 + Math.exp(0.03 * diff));
}

/** Ordered matchup IDs in simulation order (R32 first, then R16, etc.) */
function buildSimOrder(
  matchups: Array<{ id: string; round: number }>,
): string[] {
  return [...matchups].sort((a, b) => a.round - b.round).map((m) => m.id);
}

function scorePicks(
  picks: Record<string, string>,
  sim: Record<string, string>,
  matchupTeams: Map<string, { teamA: string | null; teamB: string | null }>,
  scoring: SimRequest['scoring'],
  teamRankings: Record<string, number>,
): number {
  let score = 0;
  for (const [matchupId, winner] of Object.entries(sim)) {
    if (!winner || picks[matchupId] !== winner) continue;
    const round = getRoundForId(matchupId);
    if (round < 0) continue;
    score += scoring.pointsPerRound[round] ?? 0;

    // Upset bonus
    const teams = matchupTeams.get(matchupId);
    if (teams) {
      const loser = sim[`${matchupId}_teamA`] === winner
        ? sim[`${matchupId}_teamB`]
        : (teams.teamA === winner ? teams.teamB : teams.teamA);
      const actualLoser = loser ?? (teams.teamA === winner ? teams.teamB : teams.teamA);
      if (actualLoser) {
        const wr = teamRankings[winner];
        const lr = teamRankings[actualLoser];
        if (wr !== undefined && lr !== undefined) {
          const rankDiff = wr - lr;
          if (rankDiff > 0) {
            const mult = scoring.upsetMultiplierPerRound[round] ?? 0;
            score += Math.floor(rankDiff / scoring.upsetModulus) * mult;
          }
        }
      }
    }

    // Champion bonus
    if (matchupId === 'FINAL') {
      score += scoring.championBonus;
    }
  }
  return score;
}

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { entries, results, hypo, matchups, teamRankings, scoring, totalSims } = e.data;

  const fixed: Record<string, string> = { ...results, ...hypo };
  const simOrder = buildSimOrder(matchups);

  // Build team lookup for each matchup from initial data
  const matchupTeams = new Map<string, { teamA: string | null; teamB: string | null }>();
  for (const m of matchups) {
    matchupTeams.set(m.id, { teamA: m.teamA, teamB: m.teamB });
  }

  // Accumulators
  const totals: Record<string, { score: number; rank: number; wins: number }> = {};
  for (const ent of entries) totals[ent.key] = { score: 0, rank: 0, wins: 0 };

  const sim: Record<string, string> = {};
  const BATCH = 100;

  for (let s = 0; s < totalSims; s++) {
    // Reset sim with fixed results
    for (const id of simOrder) delete sim[id];
    for (const k in fixed) sim[k] = fixed[k];

    // Simulate in round order
    for (const id of simOrder) {
      if (sim[id]) continue; // Already decided

      let teamA: string | undefined;
      let teamB: string | undefined;

      // R32: teams come from matchup data
      const mData = matchupTeams.get(id);
      if (getRoundForId(id) === 0) {
        teamA = mData?.teamA ?? undefined;
        teamB = mData?.teamB ?? undefined;
      } else {
        // Later rounds: get winners of feeder matchups
        const feeders = getFeeders(id);
        if (feeders) {
          teamA = sim[feeders[0]] ?? undefined;
          teamB = sim[feeders[1]] ?? undefined;
          // For 3RD place match, use losers of SF instead of winners
          if (id === '3RD') {
            const sf1Winner = sim['SF-1'];
            const sf2Winner = sim['SF-2'];
            const sf1Data = matchupTeams.get('SF-1');
            const sf2Data = matchupTeams.get('SF-2');
            // Get SF feeders to find the actual teams
            const sf1Feeders = getFeeders('SF-1');
            const sf2Feeders = getFeeders('SF-2');
            const sf1A = sf1Feeders ? sim[sf1Feeders[0]] : sf1Data?.teamA;
            const sf1B = sf1Feeders ? sim[sf1Feeders[1]] : sf1Data?.teamB;
            const sf2A = sf2Feeders ? sim[sf2Feeders[0]] : sf2Data?.teamA;
            const sf2B = sf2Feeders ? sim[sf2Feeders[1]] : sf2Data?.teamB;
            teamA = sf1Winner === sf1A ? (sf1B ?? undefined) : (sf1A ?? undefined);
            teamB = sf2Winner === sf2A ? (sf2B ?? undefined) : (sf2A ?? undefined);
          }
        }
      }

      if (!teamA || !teamB) continue;

      const rankA = teamRankings[teamA] ?? 50;
      const rankB = teamRankings[teamB] ?? 50;
      const prob = winProb(rankA, rankB);
      sim[id] = Math.random() < prob ? teamA : teamB;
    }

    // Score each entry
    const scores: { key: string; score: number }[] = [];
    for (const ent of entries) {
      scores.push({
        key: ent.key,
        score: scorePicks(ent.picks, sim, matchupTeams, scoring, teamRankings),
      });
    }
    scores.sort((a, b) => b.score - a.score);
    for (let i = 0; i < scores.length; i++) {
      const t = totals[scores[i].key];
      t.score += scores[i].score;
      t.rank += i + 1;
      if (i === 0) t.wins++;
    }

    if ((s + 1) % BATCH === 0 || s + 1 === totalSims) {
      const n = s + 1;
      const partial = entries.map((ent) => {
        const t = totals[ent.key];
        return {
          key: ent.key,
          avgScore: Math.round((t.score / n) * 10) / 10,
          avgPlace: Math.round((t.rank / n) * 10) / 10,
          winPct: Math.round((t.wins / n) * 1000) / 10,
        };
      });
      partial.sort((a, b) => b.winPct - a.winPct || a.avgPlace - b.avgPlace || b.avgScore - a.avgScore);
      (self as unknown as Worker).postMessage({
        type: n >= totalSims ? 'done' : 'progress',
        progress: n,
        results: partial,
      } as SimResultMsg);
    }
  }
};

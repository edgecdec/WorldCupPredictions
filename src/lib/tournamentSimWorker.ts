// Web Worker for full tournament simulation (group stage + knockout)
// Self-contained — no imports (workers can't use path aliases)

interface TeamRating {
  name: string;
  pele: number;
  gf: number;
  ga: number;
}

interface PlayerEntry {
  key: string;
  group_predictions: Array<{ groupName: string; order: string[] }>;
  third_place_picks: string[];
  knockout_picks: Record<string, string>;
}

interface ScoringSettings {
  groupStage: {
    advanceCorrect: number;
    exactPosition: number;
    upsetBonusPerPlace: number;
    advancementCorrectBonus: number;
    perfectOrderBonus: number;
  };
  knockout: {
    pointsPerRound: number[];
    upsetMultiplierPerRound: number[];
    upsetModulus: number;
    championBonus: number;
  };
}

interface TournamentSimRequest {
  type: 'run';
  ratings: Record<string, TeamRating>;
  avgGA: number;
  groups: Record<string, string[]>;
  numSims: number;
  entries?: PlayerEntry[];
  scoring?: ScoringSettings;
  teamSeeds?: Record<string, number>;
  teamRankings?: Record<string, number>;
}

interface GroupPositionResult {
  team: string;
  pos: number[];  // count of times finished in each position [1st, 2nd, 3rd, 4th]
  advance: number;
}

interface BracketSlotResult {
  slotId: string;
  round: string;
  teams: Array<{ team: string; count: number }>;
}

interface PlayerScoreResult {
  key: string;
  avgScore: number;
  avgRank: number;
  winPct: number;
}

interface SimResponse {
  type: 'progress' | 'done';
  progress?: number;
  results?: {
    groupResults: Record<string, GroupPositionResult[]>;
    bracketSlots: BracketSlotResult[];
    championProbs: Array<{ team: string; pct: number }>;
    advanceProbs: Array<{ team: string; pct: number }>;
    playerScores?: PlayerScoreResult[];
  };
}

// FIFA R32 bracket structure
// Format: [teamASource, teamBSource]
// Sources: "1X" = winner of group X, "2X" = runner-up of group X, "3:" + slotIndex = 3rd place assigned to that slot
const R32_STRUCTURE = [
  ['2A', '2B'],      // R32-1
  ['1E', '3:0'],     // R32-2
  ['1F', '2C'],      // R32-3
  ['1C', '2F'],      // R32-4
  ['1I', '3:1'],     // R32-5
  ['2E', '2I'],      // R32-6
  ['1A', '3:2'],     // R32-7
  ['1L', '3:3'],     // R32-8
  ['1D', '3:4'],     // R32-9
  ['1G', '3:5'],     // R32-10
  ['2K', '2L'],      // R32-11
  ['1H', '2J'],      // R32-12
  ['1B', '3:6'],     // R32-13
  ['1J', '2H'],      // R32-14
  ['1K', '3:7'],     // R32-15
  ['2D', '2G'],      // R32-16
];

// R16 pairings: winners of R32 matches paired sequentially
// R16-1 = W(R32-1) vs W(R32-2), R16-2 = W(R32-3) vs W(R32-4), etc.
// QF-1 = W(R16-1) vs W(R16-2), etc.

function poissonSample(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

function simulateGroupMatch(
  teamA: string, teamB: string,
  ratings: Record<string, TeamRating>, avgGA: number,
): [number, number] {
  const a = ratings[teamA], b = ratings[teamB];
  if (!a || !b) return [0, 0];
  const lambdaA = a.gf * (b.ga / avgGA);
  const lambdaB = b.gf * (a.ga / avgGA);
  return [poissonSample(lambdaA), poissonSample(lambdaB)];
}

function simulateKnockoutMatch(
  teamA: string, teamB: string,
  ratings: Record<string, TeamRating>, avgGA: number,
): string {
  const [ga, gb] = simulateGroupMatch(teamA, teamB, ratings, avgGA);
  if (ga !== gb) return ga > gb ? teamA : teamB;
  // Draw: decide by PELE-weighted coin flip (simulates extra time + penalties)
  const a = ratings[teamA], b = ratings[teamB];
  if (!a || !b) return Math.random() < 0.5 ? teamA : teamB;
  const probA = a.pele / (a.pele + b.pele);
  return Math.random() < probA ? teamA : teamB;
}

function simulateGroupStage(
  groups: Record<string, string[]>,
  ratings: Record<string, TeamRating>,
  avgGA: number,
): Record<string, string[]> {
  const results: Record<string, string[]> = {};
  for (const [name, teams] of Object.entries(groups)) {
    const table: Record<string, { pts: number; gf: number; ga: number; gd: number }> = {};
    for (const t of teams) table[t] = { pts: 0, gf: 0, ga: 0, gd: 0 };
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const [ga, gb] = simulateGroupMatch(teams[i], teams[j], ratings, avgGA);
        table[teams[i]].gf += ga; table[teams[i]].ga += gb;
        table[teams[j]].gf += gb; table[teams[j]].ga += ga;
        if (ga > gb) table[teams[i]].pts += 3;
        else if (ga === gb) { table[teams[i]].pts += 1; table[teams[j]].pts += 1; }
        else table[teams[j]].pts += 3;
      }
    }
    for (const t of teams) table[t].gd = table[t].gf - table[t].ga;
    results[name] = [...teams].sort((a, b) =>
      table[b].pts - table[a].pts || table[b].gd - table[a].gd || table[b].gf - table[a].gf
    );
  }
  return results;
}

function getBest3rdPlace(
  groupResults: Record<string, string[]>,
  ratings: Record<string, TeamRating>,
): string[] {
  const thirds = Object.values(groupResults).map(order => order[2]);
  // Sort by PELE rating (proxy for FIFA tiebreakers without recomputing points)
  thirds.sort((a, b) => (ratings[b]?.pele ?? 0) - (ratings[a]?.pele ?? 0));
  return thirds.slice(0, 8);
}

function simulateKnockout(
  groupResults: Record<string, string[]>,
  advancing3rd: string[],
  ratings: Record<string, TeamRating>,
  avgGA: number,
): { slotTeams: Record<string, string>; champion: string } {
  const winners: Record<string, string> = {};
  const runnersUp: Record<string, string> = {};
  for (const [g, order] of Object.entries(groupResults)) {
    winners[g] = order[0];
    runnersUp[g] = order[1];
  }

  function resolveSource(src: string): string {
    if (src.startsWith('1')) return winners[src[1]];
    if (src.startsWith('2')) return runnersUp[src[1]];
    if (src.startsWith('3:')) return advancing3rd[parseInt(src.slice(2))];
    return '';
  }

  const slotTeams: Record<string, string> = {};

  // R32
  const r32Winners: string[] = [];
  for (let i = 0; i < 16; i++) {
    const [srcA, srcB] = R32_STRUCTURE[i];
    const teamA = resolveSource(srcA);
    const teamB = resolveSource(srcB);
    slotTeams[`R32-${i + 1}-A`] = teamA;
    slotTeams[`R32-${i + 1}-B`] = teamB;
    const winner = simulateKnockoutMatch(teamA, teamB, ratings, avgGA);
    slotTeams[`R32-${i + 1}-W`] = winner;
    r32Winners.push(winner);
  }

  // R16
  const r16Winners: string[] = [];
  for (let i = 0; i < 8; i++) {
    const teamA = r32Winners[i * 2];
    const teamB = r32Winners[i * 2 + 1];
    slotTeams[`R16-${i + 1}-A`] = teamA;
    slotTeams[`R16-${i + 1}-B`] = teamB;
    const winner = simulateKnockoutMatch(teamA, teamB, ratings, avgGA);
    slotTeams[`R16-${i + 1}-W`] = winner;
    r16Winners.push(winner);
  }

  // QF
  const qfWinners: string[] = [];
  for (let i = 0; i < 4; i++) {
    const teamA = r16Winners[i * 2];
    const teamB = r16Winners[i * 2 + 1];
    slotTeams[`QF-${i + 1}-A`] = teamA;
    slotTeams[`QF-${i + 1}-B`] = teamB;
    const winner = simulateKnockoutMatch(teamA, teamB, ratings, avgGA);
    slotTeams[`QF-${i + 1}-W`] = winner;
    qfWinners.push(winner);
  }

  // SF
  const sfWinners: string[] = [];
  const sfLosers: string[] = [];
  for (let i = 0; i < 2; i++) {
    const teamA = qfWinners[i * 2];
    const teamB = qfWinners[i * 2 + 1];
    slotTeams[`SF-${i + 1}-A`] = teamA;
    slotTeams[`SF-${i + 1}-B`] = teamB;
    const winner = simulateKnockoutMatch(teamA, teamB, ratings, avgGA);
    const loser = winner === teamA ? teamB : teamA;
    slotTeams[`SF-${i + 1}-W`] = winner;
    sfWinners.push(winner);
    sfLosers.push(loser);
  }

  // 3rd place match
  slotTeams['3RD-A'] = sfLosers[0];
  slotTeams['3RD-B'] = sfLosers[1];
  slotTeams['3RD-W'] = simulateKnockoutMatch(sfLosers[0], sfLosers[1], ratings, avgGA);

  // Final
  slotTeams['FINAL-A'] = sfWinners[0];
  slotTeams['FINAL-B'] = sfWinners[1];
  const champion = simulateKnockoutMatch(sfWinners[0], sfWinners[1], ratings, avgGA);
  slotTeams['FINAL-W'] = champion;

  return { slotTeams, champion };
}

// --- Player Scoring ---

function scoreGroupStageEntry(
  predictions: Array<{ groupName: string; order: string[] }>,
  thirdPlacePicks: string[],
  actualResults: Record<string, string[]>,
  advancing3rd: string[],
  teamSeeds: Record<string, number>,
  settings: ScoringSettings['groupStage'],
): number {
  let total = 0;
  for (const [groupName, actualOrder] of Object.entries(actualResults)) {
    const pred = predictions.find(p => p.groupName === groupName);
    if (!pred) continue;

    let advCorrectPts = 0, exactPts = 0, upsetPts = 0;
    let allAdvCorrect = true, allPosCorrect = true;

    for (let i = 0; i < 4; i++) {
      const team = actualOrder[i];
      const actualPos = i + 1;
      const predIdx = pred.order.indexOf(team);
      if (predIdx === -1) continue;
      const predPos = predIdx + 1;

      const predAdvance = predPos <= 2 || (predPos === 3 && thirdPlacePicks.includes(team));
      const actAdvance = actualPos <= 2 || (actualPos === 3 && advancing3rd.includes(team));
      if (predAdvance === actAdvance) advCorrectPts += settings.advanceCorrect;
      else allAdvCorrect = false;

      if (predPos === actualPos) exactPts += settings.exactPosition;
      else allPosCorrect = false;

      const seed = teamSeeds[team] ?? 4;
      if (actualPos <= predPos) {
        const bonus = Math.max(0, seed - predPos);
        upsetPts += bonus * settings.upsetBonusPerPlace;
      }
    }

    total += advCorrectPts + exactPts + upsetPts
      + (allAdvCorrect ? settings.advancementCorrectBonus : 0)
      + (allPosCorrect ? settings.perfectOrderBonus : 0);
  }
  return total;
}

interface KoMatchResult {
  winner: string;
  loser: string;
  round: number;
}

function scoreKnockoutEntry(
  picks: Record<string, string>,
  matchResults: Record<string, KoMatchResult>,
  teamRankings: Record<string, number>,
  settings: ScoringSettings['knockout'],
): number {
  let total = 0;
  for (const [matchId, result] of Object.entries(matchResults)) {
    if (!picks[matchId] || picks[matchId] !== result.winner) continue;

    total += settings.pointsPerRound[result.round] ?? 0;

    const winnerRank = teamRankings[result.winner] ?? 50;
    const loserRank = teamRankings[result.loser] ?? 50;
    const rankDiff = winnerRank - loserRank;
    if (rankDiff > 0) {
      const mult = settings.upsetMultiplierPerRound[result.round] ?? 0;
      total += Math.floor(rankDiff / settings.upsetModulus) * mult;
    }
  }
  return total;
}

// eslint-disable-next-line no-restricted-globals
const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<TournamentSimRequest>) => {
  const { ratings, avgGA, groups, numSims, entries, scoring, teamSeeds, teamRankings } = e.data;

  // Accumulators
  const groupPos: Record<string, number[][]> = {};
  const advanceCounts: Record<string, number> = {};
  const slotCounts: Record<string, Record<string, number>> = {};
  const championCounts: Record<string, number> = {};

  const allTeams = Object.values(groups).flat();
  for (const t of allTeams) {
    advanceCounts[t] = 0;
    championCounts[t] = 0;
  }
  for (const [g, teams] of Object.entries(groups)) {
    groupPos[g] = teams.map(() => [0, 0, 0, 0]);
  }

  // Player scoring accumulators
  const playerTotals: Record<string, { score: number; rank: number; wins: number }> = {};
  const hasPlayers = entries && entries.length > 0 && scoring && teamSeeds;
  if (hasPlayers) {
    for (const ent of entries!) playerTotals[ent.key] = { score: 0, rank: 0, wins: 0 };
  }

  const PROGRESS_INTERVAL = Math.max(1, Math.floor(numSims / 20));

  for (let sim = 0; sim < numSims; sim++) {
    if (sim % PROGRESS_INTERVAL === 0) {
      ctx.postMessage({ type: 'progress', progress: sim } as SimResponse);
    }

    const groupResults = simulateGroupStage(groups, ratings, avgGA);
    const advancing3rd = getBest3rdPlace(groupResults, ratings);

    // Track group positions
    for (const [g, order] of Object.entries(groupResults)) {
      const teams = groups[g];
      for (let pos = 0; pos < 4; pos++) {
        const teamIdx = teams.indexOf(order[pos]);
        if (teamIdx >= 0) groupPos[g][teamIdx][pos]++;
      }
    }

    // Track advancement (top 2 + best 3rd)
    for (const order of Object.values(groupResults)) {
      advanceCounts[order[0]]++;
      advanceCounts[order[1]]++;
    }
    for (const t of advancing3rd) {
      advanceCounts[t]++;
    }

    // Simulate knockout
    const { slotTeams, champion } = simulateKnockout(groupResults, advancing3rd, ratings, avgGA);
    championCounts[champion]++;

    // Track bracket slot occupancy
    for (const [slot, team] of Object.entries(slotTeams)) {
      if (!slotCounts[slot]) slotCounts[slot] = {};
      slotCounts[slot][team] = (slotCounts[slot][team] ?? 0) + 1;
    }

    // Score players
    if (hasPlayers) {
      // Build knockout match results with losers and rounds from slotTeams
      const koMatchResults: Record<string, KoMatchResult> = {};
      const roundLabels = ['R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'];
      for (let rIdx = 0; rIdx < roundLabels.length; rIdx++) {
        const prefix = roundLabels[rIdx];
        if (prefix === '3RD' || prefix === 'FINAL') {
          const w = slotTeams[`${prefix}-W`];
          const a = slotTeams[`${prefix}-A`];
          const b = slotTeams[`${prefix}-B`];
          if (w && a && b) {
            koMatchResults[prefix] = { winner: w, loser: w === a ? b : a, round: rIdx };
          }
        } else {
          const count = prefix === 'R32' ? 16 : prefix === 'R16' ? 8 : prefix === 'QF' ? 4 : 2;
          for (let i = 1; i <= count; i++) {
            const matchId = `${prefix}-${i}`;
            const w = slotTeams[`${matchId}-W`];
            const a = slotTeams[`${matchId}-A`];
            const b = slotTeams[`${matchId}-B`];
            if (w && a && b) {
              koMatchResults[matchId] = { winner: w, loser: w === a ? b : a, round: rIdx };
            }
          }
        }
      }

      const scores: { key: string; score: number }[] = [];
      for (const ent of entries!) {
        const gsScore = scoreGroupStageEntry(
          ent.group_predictions, ent.third_place_picks,
          groupResults, advancing3rd, teamSeeds!, scoring!.groupStage,
        );
        const koScore = scoreKnockoutEntry(ent.knockout_picks, koMatchResults, teamRankings ?? {}, scoring!.knockout);
        scores.push({ key: ent.key, score: gsScore + koScore });
      }
      scores.sort((a, b) => b.score - a.score);
      for (let i = 0; i < scores.length; i++) {
        const t = playerTotals[scores[i].key];
        t.score += scores[i].score;
        t.rank += i + 1;
        if (i === 0) t.wins++;
      }
    }
  }

  // Build results
  const groupResultsOut: Record<string, GroupPositionResult[]> = {};
  for (const [g, teams] of Object.entries(groups)) {
    groupResultsOut[g] = teams.map((team, idx) => ({
      team,
      pos: groupPos[g][idx],
      advance: advanceCounts[team],
    }));
  }

  const bracketSlots: BracketSlotResult[] = [];
  for (const [slotId, counts] of Object.entries(slotCounts)) {
    const teams = Object.entries(counts)
      .map(([team, count]) => ({ team, count }))
      .sort((a, b) => b.count - a.count);
    const round = slotId.split('-')[0];
    bracketSlots.push({ slotId, round, teams });
  }

  const championProbs = Object.entries(championCounts)
    .filter(([, c]) => c > 0)
    .map(([team, count]) => ({ team, pct: Math.round((count / numSims) * 1000) / 10 }))
    .sort((a, b) => b.pct - a.pct);

  const advanceProbs = Object.entries(advanceCounts)
    .map(([team, count]) => ({ team, pct: Math.round((count / numSims) * 1000) / 10 }))
    .sort((a, b) => b.pct - a.pct);

  // Player score results
  let playerScores: PlayerScoreResult[] | undefined;
  if (hasPlayers) {
    playerScores = entries!.map((ent) => {
      const t = playerTotals[ent.key];
      return {
        key: ent.key,
        avgScore: Math.round((t.score / numSims) * 10) / 10,
        avgRank: Math.round((t.rank / numSims) * 10) / 10,
        winPct: Math.round((t.wins / numSims) * 1000) / 10,
      };
    }).sort((a, b) => b.avgScore - a.avgScore);
  }

  ctx.postMessage({
    type: 'done',
    results: { groupResults: groupResultsOut, bracketSlots, championProbs, advanceProbs, playerScores },
  } as SimResponse);
};

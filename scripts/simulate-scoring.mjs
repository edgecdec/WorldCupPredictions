/**
 * World Cup 2026 Scoring Balance Simulator
 *
 * Uses DraftKings betting odds (May 2026) to derive win probabilities,
 * then simulates thousands of tournaments to understand point distributions.
 *
 * Run: node scripts/simulate-scoring.mjs [numSims]
 */

// --- ODDS DATA (DraftKings, May 29 2026) ---
// Decimal odds for "to win group" — convert to implied probability

const GROUPS = {
  A: { Mexico: 1.91, "South Africa": 13.00, "South Korea": 4.50, Czechia: 4.30 },
  B: { Canada: 3.00, "Bosnia and Herzegovina": 6.00, Qatar: 31.00, Switzerland: 1.80 },
  C: { Brazil: 1.29, Morocco: 5.00, Haiti: 121.00, Scotland: 11.00 },
  D: { USA: 2.40, Paraguay: 5.00, Australia: 9.00, Turkiye: 2.75 },
  E: { Germany: 1.40, Curacao: 121.00, "Ivory Coast": 7.00, Ecuador: 4.70 },
  F: { Netherlands: 1.80, Japan: 3.75, Sweden: 5.50, Tunisia: 13.00 },
  G: { Belgium: 1.45, Egypt: 5.00, Iran: 7.50, "New Zealand": 23.00 },
  H: { Spain: 1.25, "Cape Verde": 51.00, "Saudi Arabia": 29.00, Uruguay: 5.00 },
  I: { France: 1.47, Senegal: 9.00, Norway: 3.75, Iraq: 51.00 },
  J: { Argentina: 1.38, Algeria: 9.00, Austria: 4.70, Jordan: 51.00 },
  K: { Portugal: 1.47, "DR Congo": 15.00, Uzbekistan: 36.00, Colombia: 3.40 },
  L: { England: 1.36, Croatia: 4.40, Ghana: 12.00, Panama: 41.00 },
};

// Outright winner odds — used to derive knockout strength
const OUTRIGHT_ODDS = {
  Spain: 5.75, France: 6.00, England: 7.50, Brazil: 9.50, Argentina: 10.00,
  Portugal: 11.00, Germany: 15.00, Netherlands: 23.00, Norway: 36.00, Belgium: 36.00,
  Colombia: 41.00, Morocco: 51.00, Uruguay: 51.00, USA: 61.00, Switzerland: 66.00,
  Japan: 66.00, Mexico: 81.00, Ecuador: 81.00, Croatia: 81.00, Turkiye: 101.00,
  Sweden: 101.00, "Ivory Coast": 251.00, Czechia: 251.00, Austria: 151.00,
  Canada: 201.00, Scotland: 201.00, Senegal: 91.00, "South Korea": 401.00,
  Egypt: 301.00, Paraguay: 301.00, Ghana: 301.00, Algeria: 351.00,
  "Bosnia and Herzegovina": 501.00, Tunisia: 501.00, Iran: 701.00,
  Australia: 601.00, "South Africa": 1001.00, "Cape Verde": 1001.00,
  "Saudi Arabia": 1001.00, "DR Congo": 1001.00, Panama: 1001.00,
  "New Zealand": 1501.00, Iraq: 1501.00, Uzbekistan: 1501.00, Qatar: 1501.00,
  Curacao: 2501.00, Haiti: 2501.00, Jordan: 2501.00,
};

// FIFA rankings (for upset bonus calc)
const FIFA_RANKINGS = {
  Spain: 1, Argentina: 2, France: 3, England: 4, Brazil: 5, Portugal: 6,
  Netherlands: 7, Belgium: 8, Germany: 9, Croatia: 10, Morocco: 11,
  Colombia: 13, USA: 14, Mexico: 15, Uruguay: 16, Switzerland: 17,
  Japan: 18, Senegal: 19, Iran: 20, "South Korea": 22, Ecuador: 23,
  Austria: 24, Turkiye: 25, Australia: 26, Canada: 27, Norway: 29,
  Panama: 30, Paraguay: 39, Egypt: 34, Algeria: 35, Scotland: 36,
  Tunisia: 40, "Ivory Coast": 42, Sweden: 43, Czechia: 44,
  Uzbekistan: 50, Qatar: 51, "DR Congo": 56, Iraq: 58,
  "Saudi Arabia": 60, "South Africa": 61, Jordan: 66,
  "Cape Verde": 68, "Bosnia and Herzegovina": 71, Ghana: 72,
  Curacao: 82, Haiti: 84, "New Zealand": 86,
};

// Pot/seed assignments
const POTS = {
  Spain: 1, Argentina: 1, France: 1, England: 1, Brazil: 1, Portugal: 1,
  Netherlands: 1, Belgium: 1, Germany: 1, USA: 1, Mexico: 1, Canada: 1,
  Croatia: 2, Morocco: 2, Colombia: 2, Uruguay: 2, Switzerland: 2,
  Japan: 2, Senegal: 2, Ecuador: 2, Austria: 2, Australia: 2, "South Korea": 2, Egypt: 2,
  Norway: 3, Panama: 3, Scotland: 3, Paraguay: 3, Tunisia: 3, "Ivory Coast": 3,
  Uzbekistan: 3, Qatar: 3, "Saudi Arabia": 3, Algeria: 3, Iran: 3, Ghana: 3,
  Jordan: 4, "Cape Verde": 4, "Bosnia and Herzegovina": 4, Turkiye: 4, Curacao: 4,
  Haiti: 4, "New Zealand": 4, Iraq: 4, "South Africa": 4, "DR Congo": 4, Sweden: 3,
};

// --- SCORING SETTINGS ---
const SCORING = {
  groupStage: {
    advanceCorrect: 1,
    exactPosition: 1,
    upsetBonusPerPlace: 1,
    advancementCorrectBonus: 1,
    perfectOrderBonus: 2,
  },
  knockout: {
    pointsPerRound: [3, 5, 8, 13, 13, 21],
    upsetMultiplierPerRound: [1, 2, 3, 5, 5, 8],
    upsetModulus: 5,
    championBonus: 0,
  },
};

// --- UTILITY FUNCTIONS ---

function oddsToProb(odds) {
  return 1 / odds;
}

function normalizeProbs(probObj) {
  const total = Object.values(probObj).reduce((s, v) => s + v, 0);
  const normalized = {};
  for (const [k, v] of Object.entries(probObj)) {
    normalized[k] = v / total;
  }
  return normalized;
}

function weightedSample(probObj) {
  const entries = Object.entries(probObj);
  const r = Math.random();
  let cumulative = 0;
  for (const [key, prob] of entries) {
    cumulative += prob;
    if (r <= cumulative) return key;
  }
  return entries[entries.length - 1][0];
}

function shuffleByProbs(teams, strengthProbs) {
  // Generate a random finishing order weighted by team strength
  const remaining = [...teams];
  const order = [];
  while (remaining.length > 0) {
    // Probability of finishing next (higher strength = more likely to be higher)
    const probs = {};
    const total = remaining.reduce((s, t) => s + (strengthProbs[t] || 0.01), 0);
    for (const t of remaining) {
      probs[t] = (strengthProbs[t] || 0.01) / total;
    }
    const picked = weightedSample(probs);
    order.push(picked);
    remaining.splice(remaining.indexOf(picked), 1);
  }
  return order;
}

// --- SIMULATION ---

function simulateGroupStage() {
  const results = {};
  for (const [groupName, odds] of Object.entries(GROUPS)) {
    const teams = Object.keys(odds);
    // Convert group-winner odds to relative strength for ordering
    const strength = {};
    for (const [team, o] of Object.entries(odds)) {
      strength[team] = oddsToProb(o);
    }
    const normalized = normalizeProbs(strength);
    const order = shuffleByProbs(teams, normalized);
    results[groupName] = order;
  }
  return results;
}

function determineBest3rdPlace(groupResults) {
  // Get all 3rd-place teams, rank by implied strength, pick top 8
  const thirdPlaceTeams = [];
  for (const order of Object.values(groupResults)) {
    thirdPlaceTeams.push(order[2]);
  }
  // Sort by outright odds (lower = stronger)
  thirdPlaceTeams.sort((a, b) => (OUTRIGHT_ODDS[a] || 9999) - (OUTRIGHT_ODDS[b] || 9999));
  return thirdPlaceTeams.slice(0, 8);
}

function simulateMatch(teamA, teamB) {
  // Use outright odds as proxy for team strength
  const strengthA = 1 / (OUTRIGHT_ODDS[teamA] || 500);
  const strengthB = 1 / (OUTRIGHT_ODDS[teamB] || 500);
  const probA = strengthA / (strengthA + strengthB);
  return Math.random() < probA ? teamA : teamB;
}

function simulateKnockout(advancing32) {
  // Simplified: pair them up in order (R32), then winners advance
  const rounds = [];
  let currentTeams = [...advancing32];

  // R32: 16 matches
  const matchesPerRound = [16, 8, 4, 2, 1, 1]; // R32, R16, QF, SF, 3rd, Final
  const roundResults = {};
  let matchId = 0;

  // R32
  const r32Winners = [];
  const r32Matches = [];
  for (let i = 0; i < 16; i++) {
    const teamA = currentTeams[i * 2];
    const teamB = currentTeams[i * 2 + 1];
    const winner = simulateMatch(teamA, teamB);
    const loser = winner === teamA ? teamB : teamA;
    r32Matches.push({ teamA, teamB, winner, loser, round: 0 });
    roundResults[`R32-${i + 1}`] = winner;
    r32Winners.push(winner);
  }

  // R16
  const r16Winners = [];
  const r16Matches = [];
  for (let i = 0; i < 8; i++) {
    const teamA = r32Winners[i * 2];
    const teamB = r32Winners[i * 2 + 1];
    const winner = simulateMatch(teamA, teamB);
    const loser = winner === teamA ? teamB : teamA;
    r16Matches.push({ teamA, teamB, winner, loser, round: 1 });
    roundResults[`R16-${i + 1}`] = winner;
    r16Winners.push(winner);
  }

  // QF
  const qfWinners = [];
  const qfMatches = [];
  for (let i = 0; i < 4; i++) {
    const teamA = r16Winners[i * 2];
    const teamB = r16Winners[i * 2 + 1];
    const winner = simulateMatch(teamA, teamB);
    const loser = winner === teamA ? teamB : teamA;
    qfMatches.push({ teamA, teamB, winner, loser, round: 2 });
    roundResults[`QF-${i + 1}`] = winner;
    qfWinners.push(winner);
  }

  // SF
  const sfMatches = [];
  const sfWinners = [];
  const sfLosers = [];
  for (let i = 0; i < 2; i++) {
    const teamA = qfWinners[i * 2];
    const teamB = qfWinners[i * 2 + 1];
    const winner = simulateMatch(teamA, teamB);
    const loser = winner === teamA ? teamB : teamA;
    sfMatches.push({ teamA, teamB, winner, loser, round: 3 });
    roundResults[`SF-${i + 1}`] = winner;
    sfWinners.push(winner);
    sfLosers.push(loser);
  }

  // 3rd place
  const thirdWinner = simulateMatch(sfLosers[0], sfLosers[1]);
  roundResults['3RD'] = thirdWinner;
  const thirdMatch = { teamA: sfLosers[0], teamB: sfLosers[1], winner: thirdWinner, loser: thirdWinner === sfLosers[0] ? sfLosers[1] : sfLosers[0], round: 4 };

  // Final
  const champion = simulateMatch(sfWinners[0], sfWinners[1]);
  roundResults['FINAL'] = champion;
  const finalMatch = { teamA: sfWinners[0], teamB: sfWinners[1], winner: champion, loser: champion === sfWinners[0] ? sfWinners[1] : sfWinners[0], round: 5 };

  const allMatches = [...r32Matches, ...r16Matches, ...qfMatches, ...sfMatches, thirdMatch, finalMatch];

  return { roundResults, allMatches, champion };
}

function generatePrediction(style) {
  // Generate a bracket prediction using different strategies
  const prediction = { groups: {}, thirdPlacePicks: [], knockoutPicks: {} };

  for (const [groupName, odds] of Object.entries(GROUPS)) {
    const teams = Object.keys(odds);
    const strength = {};
    for (const [team, o] of Object.entries(odds)) {
      strength[team] = oddsToProb(o);
    }

    if (style === 'chalk') {
      // Sort by strength (highest first)
      const sorted = [...teams].sort((a, b) => strength[b] - strength[a]);
      prediction.groups[groupName] = sorted;
    } else if (style === 'smart') {
      // 80% weight to strength, 20% noise
      const noisy = {};
      for (const t of teams) {
        noisy[t] = strength[t] * (0.8 + Math.random() * 0.4);
      }
      const sorted = [...teams].sort((a, b) => noisy[b] - noisy[a]);
      prediction.groups[groupName] = sorted;
    } else if (style === 'random') {
      const shuffled = [...teams].sort(() => Math.random() - 0.5);
      prediction.groups[groupName] = shuffled;
    } else if (style === 'upset') {
      // Deliberately pick some upsets — reverse bottom two in each group 50% of the time
      const sorted = [...teams].sort((a, b) => strength[b] - strength[a]);
      if (Math.random() < 0.5) {
        [sorted[0], sorted[1]] = [sorted[1], sorted[0]]; // swap 1st and 2nd
      }
      if (Math.random() < 0.3) {
        [sorted[2], sorted[3]] = [sorted[3], sorted[2]]; // swap 3rd and 4th
      }
      prediction.groups[groupName] = sorted;
    }
  }

  // Pick 8 best 3rd-place teams by strength
  const thirdPlaceTeams = Object.entries(prediction.groups).map(([g, order]) => order[2]);
  thirdPlaceTeams.sort((a, b) => (OUTRIGHT_ODDS[a] || 9999) - (OUTRIGHT_ODDS[b] || 9999));
  prediction.thirdPlacePicks = thirdPlaceTeams.slice(0, 8);

  return prediction;
}

function scoreGroupStage(prediction, actualResults, advancingThirdPlace) {
  let total = 0;
  const gs = SCORING.groupStage;

  for (const [groupName, actualOrder] of Object.entries(actualResults)) {
    const predictedOrder = prediction.groups[groupName];
    if (!predictedOrder) continue;

    let advanceCorrectPts = 0;
    let exactPositionPts = 0;
    let upsetBonusPts = 0;
    let allAdvanceCorrect = true;
    let allPositionsCorrect = true;

    for (let i = 0; i < 4; i++) {
      const teamName = actualOrder[i];
      const actualPos = i + 1;
      const predictedIdx = predictedOrder.indexOf(teamName);
      if (predictedIdx === -1) continue;
      const predictedPos = predictedIdx + 1;

      // Advance correct
      const predictedAdvance = predictedPos <= 2 || (predictedPos === 3 && prediction.thirdPlacePicks.includes(teamName));
      const actualAdvance = actualPos <= 2 || (actualPos === 3 && advancingThirdPlace.includes(teamName));
      if (predictedAdvance === actualAdvance) {
        advanceCorrectPts += gs.advanceCorrect;
      } else {
        allAdvanceCorrect = false;
      }

      // Exact position
      if (predictedPos === actualPos) {
        exactPositionPts += gs.exactPosition;
      } else {
        allPositionsCorrect = false;
      }

      // Upset bonus
      const seed = POTS[teamName] || 4;
      if (actualPos <= predictedPos) {
        const bonus = Math.max(0, seed - predictedPos);
        upsetBonusPts += bonus * gs.upsetBonusPerPlace;
      }
    }

    const advBonus = allAdvanceCorrect ? gs.advancementCorrectBonus : 0;
    const perfectBonus = allPositionsCorrect ? gs.perfectOrderBonus : 0;
    total += advanceCorrectPts + exactPositionPts + upsetBonusPts + advBonus + perfectBonus;
  }

  return total;
}

function scoreKnockout(prediction, allMatches, actualResults, advancing32) {
  let total = 0;
  let upsetBonus = 0;
  const ko = SCORING.knockout;

  // Generate knockout picks from prediction (simplified — pick stronger team)
  // For simulation, we generate picks for each match based on the advancing teams
  const picks = prediction.knockoutPicks || {};

  // If no knockout picks, generate them chalk-style from the prediction
  if (Object.keys(picks).length === 0) {
    // For each match, pick the team with better outright odds
    for (const match of allMatches) {
      const matchId = `${['R32','R16','QF','SF','3RD','FINAL'][match.round]}-${match.round <= 3 ? allMatches.filter(m => m.round === match.round).indexOf(match) + 1 : ''}`.replace(/-$/, '');
      const strengthA = 1 / (OUTRIGHT_ODDS[match.teamA] || 500);
      const strengthB = 1 / (OUTRIGHT_ODDS[match.teamB] || 500);

      if (prediction.style === 'chalk') {
        picks[matchId] = strengthA >= strengthB ? match.teamA : match.teamB;
      } else if (prediction.style === 'upset') {
        // 30% chance to pick the underdog
        if (Math.random() < 0.3) {
          picks[matchId] = strengthA < strengthB ? match.teamA : match.teamB;
        } else {
          picks[matchId] = strengthA >= strengthB ? match.teamA : match.teamB;
        }
      } else {
        // Smart: weighted by strength with noise
        const probA = strengthA / (strengthA + strengthB);
        picks[matchId] = Math.random() < (probA * 0.8 + 0.1) ? match.teamA : match.teamB;
      }
    }
  }

  // Score each match
  for (const match of allMatches) {
    const roundIdx = match.round;
    const matchId = Object.keys(actualResults).find(k => actualResults[k] === match.winner && k.startsWith(['R32','R16','QF','SF','3RD','FINAL'][roundIdx]));

    // Simplified: check if user picked the winner of this match
    const userPick = picks[matchId] || null;
    if (userPick === match.winner) {
      // Base points
      total += ko.pointsPerRound[roundIdx] || 0;

      // Upset bonus
      const winnerRank = FIFA_RANKINGS[match.winner] || 50;
      const loserRank = FIFA_RANKINGS[match.loser] || 50;
      const rankDiff = winnerRank - loserRank;
      if (rankDiff > 0) {
        const mult = ko.upsetMultiplierPerRound[roundIdx] || 0;
        const bonus = Math.floor(rankDiff / ko.upsetModulus) * mult;
        upsetBonus += bonus;
        total += bonus;
      }
    }
  }

  return { total, upsetBonus };
}

function simulateKnockoutPicks(allMatches, style) {
  const picks = {};
  for (let i = 0; i < allMatches.length; i++) {
    const match = allMatches[i];
    const strengthA = 1 / (OUTRIGHT_ODDS[match.teamA] || 500);
    const strengthB = 1 / (OUTRIGHT_ODDS[match.teamB] || 500);

    if (style === 'chalk') {
      picks[i] = strengthA >= strengthB ? match.teamA : match.teamB;
    } else if (style === 'upset') {
      picks[i] = Math.random() < 0.3
        ? (strengthA < strengthB ? match.teamA : match.teamB)
        : (strengthA >= strengthB ? match.teamA : match.teamB);
    } else if (style === 'smart') {
      const probA = strengthA / (strengthA + strengthB);
      picks[i] = Math.random() < (probA * 0.7 + 0.15) ? match.teamA : match.teamB;
    } else {
      picks[i] = Math.random() < 0.5 ? match.teamA : match.teamB;
    }
  }
  return picks;
}

function scoreKnockoutDirect(picks, allMatches) {
  const ko = SCORING.knockout;
  let baseTotal = 0;
  let upsetTotal = 0;

  for (let i = 0; i < allMatches.length; i++) {
    const match = allMatches[i];
    if (picks[i] === match.winner) {
      baseTotal += ko.pointsPerRound[match.round] || 0;

      const winnerRank = FIFA_RANKINGS[match.winner] || 50;
      const loserRank = FIFA_RANKINGS[match.loser] || 50;
      const rankDiff = winnerRank - loserRank;
      if (rankDiff > 0) {
        const mult = ko.upsetMultiplierPerRound[match.round] || 0;
        upsetTotal += Math.floor(rankDiff / ko.upsetModulus) * mult;
      }
    }
  }

  return { base: baseTotal, upset: upsetTotal, total: baseTotal + upsetTotal };
}

// --- MAIN SIMULATION ---

const NUM_SIMS = parseInt(process.argv[2]) || 5000;

console.log(`=== WORLD CUP 2026 SCORING SIMULATION (${NUM_SIMS} tournaments) ===`);
console.log('Using DraftKings odds (May 2026) for team strengths');
console.log('');

const styles = ['chalk', 'smart', 'upset', 'random'];
const results = {};
for (const style of styles) {
  results[style] = { groupScores: [], koBaseScores: [], koUpsetScores: [], koTotalScores: [], totalScores: [] };
}

// Also track tournament-level stats
const tournamentStats = {
  upsetsByRound: [0, 0, 0, 0, 0, 0], // count of upsets per round
  maxRankDiffByRound: [0, 0, 0, 0, 0, 0],
  avgRankDiffByRound: Array(6).fill(null).map(() => []),
  finalistRanks: [],
  championRanks: [],
};

for (let sim = 0; sim < NUM_SIMS; sim++) {
  // Simulate the actual tournament
  const groupResults = simulateGroupStage();
  const advancingThird = determineBest3rdPlace(groupResults);

  // Build advancing 32 teams
  const advancing32 = [];
  for (const order of Object.values(groupResults)) {
    advancing32.push(order[0], order[1]); // Top 2
  }
  for (const team of advancingThird) {
    advancing32.push(team);
  }
  // Shuffle to create bracket matchups (simplified)
  advancing32.sort(() => Math.random() - 0.5);

  const { allMatches, champion } = simulateKnockout(advancing32);

  // Track tournament stats
  tournamentStats.championRanks.push(FIFA_RANKINGS[champion] || 50);
  for (const match of allMatches) {
    const winnerRank = FIFA_RANKINGS[match.winner] || 50;
    const loserRank = FIFA_RANKINGS[match.loser] || 50;
    const diff = winnerRank - loserRank;
    if (diff > 0) {
      tournamentStats.upsetsByRound[match.round]++;
      tournamentStats.maxRankDiffByRound[match.round] = Math.max(tournamentStats.maxRankDiffByRound[match.round], diff);
    }
    tournamentStats.avgRankDiffByRound[match.round].push(Math.abs(diff));
    if (match.round === 5) {
      tournamentStats.finalistRanks.push(winnerRank, loserRank);
    }
  }

  // Score each prediction style
  for (const style of styles) {
    const prediction = generatePrediction(style);
    prediction.style = style;

    const groupScore = scoreGroupStage(prediction, groupResults, advancingThird);
    const koPicks = simulateKnockoutPicks(allMatches, style);
    const koScore = scoreKnockoutDirect(koPicks, allMatches);

    results[style].groupScores.push(groupScore);
    results[style].koBaseScores.push(koScore.base);
    results[style].koUpsetScores.push(koScore.upset);
    results[style].koTotalScores.push(koScore.total);
    results[style].totalScores.push(groupScore + koScore.total);
  }
}

// --- REPORT ---

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    mean: (sum / sorted.length).toFixed(1),
    median: sorted[Math.floor(sorted.length / 2)].toFixed(1),
    p10: sorted[Math.floor(sorted.length * 0.1)].toFixed(1),
    p25: sorted[Math.floor(sorted.length * 0.25)].toFixed(1),
    p75: sorted[Math.floor(sorted.length * 0.75)].toFixed(1),
    p90: sorted[Math.floor(sorted.length * 0.9)].toFixed(1),
    min: sorted[0].toFixed(1),
    max: sorted[sorted.length - 1].toFixed(1),
  };
}

console.log('=== SCORE DISTRIBUTIONS BY PREDICTION STYLE ===');
console.log('');

for (const style of styles) {
  const r = results[style];
  console.log(`--- ${style.toUpperCase()} ---`);
  const gs = stats(r.groupScores);
  const koB = stats(r.koBaseScores);
  const koU = stats(r.koUpsetScores);
  const koT = stats(r.koTotalScores);
  const tot = stats(r.totalScores);

  console.log(`  Group Stage:    mean=${gs.mean}  median=${gs.median}  [p10=${gs.p10}, p90=${gs.p90}]  range=[${gs.min}, ${gs.max}]`);
  console.log(`  KO Base:        mean=${koB.mean}  median=${koB.median}  [p10=${koB.p10}, p90=${koB.p90}]  range=[${koB.min}, ${koB.max}]`);
  console.log(`  KO Upset Bonus: mean=${koU.mean}  median=${koU.median}  [p10=${koU.p10}, p90=${koU.p90}]  range=[${koU.min}, ${koU.max}]`);
  console.log(`  KO Total:       mean=${koT.mean}  median=${koT.median}  [p10=${koT.p10}, p90=${koT.p90}]  range=[${koT.min}, ${koT.max}]`);
  console.log(`  TOTAL:          mean=${tot.mean}  median=${tot.median}  [p10=${tot.p10}, p90=${tot.p90}]  range=[${tot.min}, ${tot.max}]`);
  console.log(`  Group % of total: ${(parseFloat(gs.mean) / parseFloat(tot.mean) * 100).toFixed(0)}%`);
  console.log(`  KO upset % of KO: ${(parseFloat(koU.mean) / parseFloat(koT.mean) * 100).toFixed(0)}%`);
  console.log('');
}

console.log('=== TOURNAMENT CHARACTERISTICS ===');
console.log('');

const roundNames = ['R32', 'R16', 'QF', 'SF', '3rd', 'Final'];
console.log('Average upsets per round (per tournament):');
for (let i = 0; i < 6; i++) {
  const matchesPerRound = [16, 8, 4, 2, 1, 1][i];
  const avgUpsets = (tournamentStats.upsetsByRound[i] / NUM_SIMS).toFixed(1);
  const pctUpsets = (tournamentStats.upsetsByRound[i] / (NUM_SIMS * matchesPerRound) * 100).toFixed(0);
  const avgDiff = (tournamentStats.avgRankDiffByRound[i].reduce((s, v) => s + v, 0) / tournamentStats.avgRankDiffByRound[i].length).toFixed(1);
  console.log(`  ${roundNames[i].padEnd(6)}: ${avgUpsets} upsets of ${matchesPerRound} matches (${pctUpsets}%) | avg rank diff: ${avgDiff} | max diff seen: ${tournamentStats.maxRankDiffByRound[i]}`);
}

console.log('');
const champStats = stats(tournamentStats.championRanks);
console.log(`Champion FIFA rank: mean=${champStats.mean}  median=${champStats.median}  [p10=${champStats.p10}, p90=${champStats.p90}]`);
const finStats = stats(tournamentStats.finalistRanks);
console.log(`Finalist FIFA rank: mean=${finStats.mean}  median=${finStats.median}  [p10=${finStats.p10}, p90=${finStats.p90}]`);

console.log('');
console.log('=== BALANCE VERDICT ===');
console.log('');
const chalkMean = parseFloat(stats(results.chalk.totalScores).mean);
const smartMean = parseFloat(stats(results.smart.totalScores).mean);
const upsetMean = parseFloat(stats(results.upset.totalScores).mean);
const randomMean = parseFloat(stats(results.random.totalScores).mean);

console.log(`Chalk vs Smart expected score gap: ${(chalkMean - smartMean).toFixed(1)} pts`);
console.log(`Chalk vs Upset expected score gap: ${(chalkMean - upsetMean).toFixed(1)} pts`);
console.log(`Smart vs Random expected score gap: ${(smartMean - randomMean).toFixed(1)} pts`);
console.log('');

const chalkGS = parseFloat(stats(results.chalk.groupScores).mean);
const chalkKO = parseFloat(stats(results.chalk.koTotalScores).mean);
console.log(`For chalk player: ${chalkGS.toFixed(0)} group + ${chalkKO.toFixed(0)} knockout = ${(chalkGS+chalkKO).toFixed(0)} total`);
console.log(`  Group stage is ${(chalkGS/(chalkGS+chalkKO)*100).toFixed(0)}% of their total score`);
console.log('');

const smartGS = parseFloat(stats(results.smart.groupScores).mean);
const smartKO = parseFloat(stats(results.smart.koTotalScores).mean);
console.log(`For smart player: ${smartGS.toFixed(0)} group + ${smartKO.toFixed(0)} knockout = ${(smartGS+smartKO).toFixed(0)} total`);
console.log(`  Group stage is ${(smartGS/(smartGS+smartKO)*100).toFixed(0)}% of their total score`);

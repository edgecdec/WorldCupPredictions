import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { getTeamSeed } from '@/lib/bracketData';
import type {
  BracketData, GroupPrediction, GroupStageResults, KnockoutResults,
  TournamentResults,
} from '@/types';

interface PredictionRow {
  id: string;
  user_id: string;
  bracket_name: string;
  username: string;
  group_predictions: string;
  third_place_picks: string;
  knockout_picks: string;
}

interface TournamentRow {
  bracket_data: string;
  results_data: string;
}

interface ChampionCount {
  team: string;
  count: number;
}

interface ContrarianPick {
  username: string;
  bracket_name: string;
  /** Rarity score, 0-100. Higher = more contrarian.
   *  Computed as 100 × (1 - avg match rate vs OTHER brackets, across all 48
   *  group-position picks). Pool of 1 returns 0 (no one to compare against). */
  rarityScore: number;
  /** Number of brackets in the pool excluding this one (denominator for context). */
  poolSize: number;
}

interface AccuracyStat {
  username: string;
  bracket_name: string;
  correctGroups: number;
  totalGroups: number;
  correctKnockout: number;
  totalKnockout: number;
  accuracyPct: number;
}

interface ChalkScore {
  username: string;
  bracket_name: string;
  /** Sum of |predicted position - team's pot| across all 48 group picks.
   *  0 = perfectly chalk (every pot-N team predicted at position N).
   *  Higher = more upset-heavy. */
  deviation: number;
}

export interface StatsResponse {
  popularChampions: ChampionCount[];
  contrarianPicks: ContrarianPick[];
  accuracy: AccuracyStat[];
  chalkScores: ChalkScore[];
}

const FINAL_MATCHUP_ID = 'FINAL';

export async function GET(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const groupId = req.nextUrl.searchParams.get('group_id');
  if (!groupId) {
    return NextResponse.json({ error: 'group_id required' }, { status: 400 });
  }

  const db = getDb();

  const tournament = db
    .prepare('SELECT bracket_data, results_data FROM tournaments ORDER BY year DESC LIMIT 1')
    .get() as TournamentRow | undefined;
  if (!tournament) {
    return NextResponse.json({ error: 'No tournament found' }, { status: 404 });
  }

  const bracketData = JSON.parse(tournament.bracket_data) as BracketData;
  const resultsData = JSON.parse(tournament.results_data) as TournamentResults;

  const predictions = db
    .prepare(
      `SELECT p.id, p.user_id, p.bracket_name, p.group_predictions,
              p.third_place_picks, p.knockout_picks, u.username
       FROM predictions p
       JOIN users u ON p.user_id = u.id AND u.is_hidden = 0
       JOIN group_members gm ON gm.prediction_id = p.id
       WHERE gm.group_id = ?`
    )
    .all(groupId) as PredictionRow[];

  const parsed = predictions.map((p) => ({
    username: p.username,
    bracket_name: p.bracket_name,
    groupPredictions: JSON.parse(p.group_predictions) as GroupPrediction[],
    thirdPlacePicks: JSON.parse(p.third_place_picks) as string[],
    knockoutPicks: JSON.parse(p.knockout_picks) as Record<string, string>,
  })).filter((p) => {
    // Drop empty predictions (users who joined after group-stage lock with no
    // picks). They aren't real entries until they fill at least one slot.
    if (p.groupPredictions.some((g) => g.order.some((t) => t))) return true;
    if (Object.keys(p.knockoutPicks).length > 0) return true;
    return false;
  });

  if (parsed.length === 0) {
    return NextResponse.json({
      popularChampions: [],
      contrarianPicks: [],
      accuracy: [],
      chalkScores: [],
    });
  }

  // Most popular champion
  const championCounts = new Map<string, number>();
  for (const p of parsed) {
    const champ = p.knockoutPicks[FINAL_MATCHUP_ID];
    if (champ) {
      championCounts.set(champ, (championCounts.get(champ) ?? 0) + 1);
    }
  }
  const popularChampions: ChampionCount[] = [...championCounts.entries()]
    .map(([team, count]) => ({ team, count }))
    .sort((a, b) => b.count - a.count);

  // Rarity score: for each pick, count brackets that made the same pick
  // (group + position + team), then divide by (totalBrackets - 1) to get the
  // self-excluded match rate. Average across all 48 picks, flip to get rarity.
  const groupPositionCounts = new Map<string, number>();
  for (const p of parsed) {
    for (const gp of p.groupPredictions) {
      gp.order.forEach((team, pos) => {
        const key = `${gp.groupName}:${pos}:${team}`;
        groupPositionCounts.set(key, (groupPositionCounts.get(key) ?? 0) + 1);
      });
    }
  }
  const totalBrackets = parsed.length;
  const otherBrackets = Math.max(0, totalBrackets - 1);
  const contrarianPicks: ContrarianPick[] = parsed.map((p) => {
    if (otherBrackets === 0) {
      return { username: p.username, bracket_name: p.bracket_name, rarityScore: 0, poolSize: otherBrackets };
    }
    let totalMatchRate = 0;
    let pickCount = 0;
    for (const gp of p.groupPredictions) {
      gp.order.forEach((team, pos) => {
        const key = `${gp.groupName}:${pos}:${team}`;
        const totalCount = groupPositionCounts.get(key) ?? 0;
        // Subtract self from numerator: how many OTHER brackets made the same pick
        const otherCount = Math.max(0, totalCount - 1);
        totalMatchRate += otherCount / otherBrackets;
        pickCount++;
      });
    }
    const avgMatchRate = pickCount > 0 ? totalMatchRate / pickCount : 0;
    const rarityScore = Math.round((1 - avgMatchRate) * 100);
    return { username: p.username, bracket_name: p.bracket_name, rarityScore, poolSize: otherBrackets };
  }).sort((a, b) => b.rarityScore - a.rarityScore);

  // Group accuracy %
  const groupStageResults: GroupStageResults | undefined = resultsData.groupStage;
  const knockoutResults: KnockoutResults | undefined = resultsData.knockout;

  const accuracy: AccuracyStat[] = parsed.map((p) => {
    let correctGroups = 0;
    let totalGroups = 0;
    if (groupStageResults) {
      for (const gp of p.groupPredictions) {
        const actual = groupStageResults.groupResults.find((r) => r.groupName === gp.groupName);
        if (!actual) continue;
        gp.order.forEach((team, pos) => {
          totalGroups++;
          if (actual.order[pos] === team) correctGroups++;
        });
      }
    }

    let correctKnockout = 0;
    let totalKnockout = 0;
    if (knockoutResults) {
      for (const [matchId, winner] of Object.entries(knockoutResults)) {
        totalKnockout++;
        if (p.knockoutPicks[matchId] === winner) correctKnockout++;
      }
    }

    const totalPicks = totalGroups + totalKnockout;
    const correctPicks = correctGroups + correctKnockout;
    const accuracyPct = totalPicks > 0 ? Math.round((correctPicks / totalPicks) * 100) : 0;

    return {
      username: p.username,
      bracket_name: p.bracket_name,
      correctGroups,
      totalGroups,
      correctKnockout,
      totalKnockout,
      accuracyPct,
    };
  }).sort((a, b) => b.accuracyPct - a.accuracyPct);

  // Chalk-deviation: how far each pick is from the team's pot/seed.
  // Pure chalk = each pot-N team predicted at position N → deviation 0.
  // Predicting Turkey (pot 4) at #1 contributes |1 - 4| = 3 deviation.
  // Sum across all 48 group-position picks. Higher = more upset-heavy.
  const chalkScores: ChalkScore[] = parsed.map((p) => {
    let deviation = 0;
    for (const gp of p.groupPredictions) {
      gp.order.forEach((team, pos) => {
        const seed = getTeamSeed(bracketData, team);
        if (seed == null) return;
        // pos is 0-indexed (0..3), seed is 1-indexed (1..4) → both to 1..4
        const predPos = pos + 1;
        deviation += Math.abs(predPos - seed);
      });
    }
    return { username: p.username, bracket_name: p.bracket_name, deviation };
  }).sort((a, b) => a.deviation - b.deviation);

  return NextResponse.json({
    popularChampions,
    contrarianPicks,
    accuracy,
    chalkScores,
  } satisfies StatsResponse);
}

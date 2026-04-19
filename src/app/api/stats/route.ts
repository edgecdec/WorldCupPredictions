import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { getTeamRanking } from '@/lib/bracketData';
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
  uniquePicks: number;
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
  chalkScore: number;
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
       JOIN users u ON p.user_id = u.id
       JOIN group_members gm ON gm.prediction_id = p.id
       WHERE gm.group_id = ?`
    )
    .all(groupId) as PredictionRow[];

  if (predictions.length === 0) {
    return NextResponse.json({
      popularChampions: [],
      contrarianPicks: [],
      accuracy: [],
      chalkScores: [],
    });
  }

  const parsed = predictions.map((p) => ({
    username: p.username,
    bracket_name: p.bracket_name,
    groupPredictions: JSON.parse(p.group_predictions) as GroupPrediction[],
    thirdPlacePicks: JSON.parse(p.third_place_picks) as string[],
    knockoutPicks: JSON.parse(p.knockout_picks) as Record<string, string>,
  }));

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

  // Most contrarian picks — count unique group position picks per user
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
  const contrarianPicks: ContrarianPick[] = parsed.map((p) => {
    let uniquePicks = 0;
    for (const gp of p.groupPredictions) {
      gp.order.forEach((team, pos) => {
        const key = `${gp.groupName}:${pos}:${team}`;
        const count = groupPositionCounts.get(key) ?? 0;
        // A pick is "contrarian" if fewer than 25% of brackets made it
        if (count / totalBrackets < 0.25) {
          uniquePicks++;
        }
      });
    }
    return { username: p.username, bracket_name: p.bracket_name, uniquePicks };
  }).sort((a, b) => b.uniquePicks - a.uniquePicks);

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

  // Chalk vs upset-heavy — lower ranking = higher seed = more "chalk"
  const chalkScores: ChalkScore[] = parsed.map((p) => {
    let chalkScore = 0;
    for (const gp of p.groupPredictions) {
      gp.order.forEach((team, pos) => {
        const ranking = getTeamRanking(bracketData, team);
        if (ranking == null) return;
        // If predicted position matches seed order (lower ranking = higher position), it's chalk
        // Score: sum of (ranking * position_weight). Lower = more chalk.
        chalkScore += ranking * (pos + 1);
      });
    }
    return { username: p.username, bracket_name: p.bracket_name, chalkScore };
  }).sort((a, b) => a.chalkScore - b.chalkScore);

  return NextResponse.json({
    popularChampions,
    contrarianPicks,
    accuracy,
    chalkScores,
  } satisfies StatsResponse);
}

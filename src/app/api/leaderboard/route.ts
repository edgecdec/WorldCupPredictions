import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { scoreTotalPrediction } from '@/lib/scoring';
import { calculateMaxPossible } from '@/lib/maxPossible';
import { calculateIndicators } from '@/lib/leaderboardIndicators';
import {
  BracketData,
  DEFAULT_SCORING,
  GroupPrediction,
  KnockoutMatchup,
  KnockoutResults,
  GroupStageResults,
  LeaderboardEntry,
  ScoringSettings,
  TournamentResults,
} from '@/types';

interface PredictionRow {
  id: string;
  user_id: string;
  bracket_name: string;
  group_predictions: string;
  third_place_picks: string;
  knockout_picks: string;
  tiebreaker: number | null;
  username: string;
}

interface GroupRow {
  scoring_settings: string;
}

interface TournamentRow {
  bracket_data: string;
  results_data: string;
}

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

  const group = db
    .prepare('SELECT scoring_settings FROM groups WHERE id = ?')
    .get(groupId) as GroupRow | undefined;
  if (!group) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  const settings: ScoringSettings = JSON.parse(group.scoring_settings) as ScoringSettings;
  const hasValidSettings = settings.groupStage && settings.knockout;
  const scoringSettings = hasValidSettings ? settings : DEFAULT_SCORING;

  const tournament = db
    .prepare('SELECT bracket_data, results_data FROM tournaments ORDER BY year DESC LIMIT 1')
    .get() as TournamentRow | undefined;
  if (!tournament) {
    return NextResponse.json({ error: 'No tournament found' }, { status: 404 });
  }

  const bracketData = JSON.parse(tournament.bracket_data) as BracketData;
  const resultsData = JSON.parse(tournament.results_data) as TournamentResults;

  const groupStageResults: GroupStageResults | undefined = resultsData.groupStage;
  const knockoutResults: KnockoutResults | undefined = resultsData.knockout;
  const knockoutMatchups: KnockoutMatchup[] | undefined = resultsData.knockoutBracket;

  const predictions = db
    .prepare(
      `SELECT p.id, p.user_id, p.bracket_name, p.group_predictions,
              p.third_place_picks, p.knockout_picks, p.tiebreaker, u.username
       FROM predictions p
       JOIN users u ON p.user_id = u.id
       JOIN group_members gm ON gm.prediction_id = p.id
       WHERE gm.group_id = ?`
    )
    .all(groupId) as PredictionRow[];

  const leaderboard: LeaderboardEntry[] = predictions.map((p) => {
    const groupPredictions = JSON.parse(p.group_predictions) as GroupPrediction[];
    const thirdPlacePicks = JSON.parse(p.third_place_picks) as string[];
    const knockoutPicks = JSON.parse(p.knockout_picks) as Record<string, string>;

    const result = scoreTotalPrediction(
      groupPredictions,
      thirdPlacePicks,
      knockoutPicks,
      groupStageResults,
      knockoutResults,
      knockoutMatchups,
      bracketData,
      scoringSettings,
    );

    const maxResult = calculateMaxPossible(
      groupPredictions,
      thirdPlacePicks,
      knockoutPicks,
      groupStageResults,
      knockoutResults,
      knockoutMatchups,
      bracketData,
      result.groupStageScore,
      result.knockoutScore,
      scoringSettings,
    );

    return {
      username: p.username,
      bracket_name: p.bracket_name,
      groupStageScore: result.groupStageScore,
      knockoutScore: result.knockoutScore,
      totalScore: result.totalScore,
      tiebreaker: p.tiebreaker,
      maxPossible: maxResult.maxTotal,
      championEliminated: maxResult.championEliminated,
      prediction: {
        id: p.id,
        user_id: p.user_id,
        bracket_name: p.bracket_name,
        group_predictions: groupPredictions,
        third_place_picks: thirdPlacePicks,
        knockout_picks: knockoutPicks,
        tiebreaker: p.tiebreaker,
      },
    };
  });

  leaderboard.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (a.tiebreaker != null && b.tiebreaker != null) return a.tiebreaker - b.tiebreaker;
    if (a.tiebreaker != null) return -1;
    if (b.tiebreaker != null) return 1;
    return 0;
  });

  const leaderScore = leaderboard.length > 0 ? leaderboard[0].totalScore : 0;
  for (const entry of leaderboard) {
    entry.eliminated = (entry.maxPossible ?? 0) < leaderScore;
  }

  // Calculate emoji indicators
  const allParsed = leaderboard.map((e) => ({
    group_predictions: e.prediction!.group_predictions,
    third_place_picks: e.prediction!.third_place_picks,
    knockout_picks: e.prediction!.knockout_picks,
  }));
  for (const entry of leaderboard) {
    const parsed = {
      group_predictions: entry.prediction!.group_predictions,
      third_place_picks: entry.prediction!.third_place_picks,
      knockout_picks: entry.prediction!.knockout_picks,
    };
    const indicators = calculateIndicators(
      parsed, allParsed, groupStageResults, knockoutResults, knockoutMatchups,
    );
    entry.perfectGroups = indicators.perfectGroups;
    entry.hotStreak = indicators.hotStreak;
    entry.contrarianPicks = indicators.contrarianPicks;
  }

  return NextResponse.json({
    leaderboard,
    scoring_settings: scoringSettings,
    results: resultsData,
    bracket_data: bracketData,
  });
}

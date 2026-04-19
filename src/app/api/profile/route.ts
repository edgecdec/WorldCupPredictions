import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { scoreTotalPrediction } from '@/lib/scoring';
import { calculateIndicators } from '@/lib/leaderboardIndicators';
import {
  DEFAULT_SCORING,
  type BracketData, type GroupPrediction,
  type ScoringSettings, type TournamentResults,
} from '@/types';

interface UserRow {
  id: string;
  username: string;
  created_at: string;
}

interface PredictionRow {
  id: string;
  bracket_name: string;
  group_predictions: string;
  third_place_picks: string;
  knockout_picks: string;
  tiebreaker: number | null;
}

interface GroupRow {
  id: string;
  name: string;
  scoring_settings: string;
}

interface TournamentRow {
  bracket_data: string;
  results_data: string;
}

interface MemberCountRow {
  group_id: string;
  cnt: number;
}

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username');
  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  const db = getDb();

  const userRow = db
    .prepare('SELECT id, username, created_at FROM users WHERE LOWER(username) = LOWER(?)')
    .get(username) as UserRow | undefined;
  if (!userRow) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const tournament = db
    .prepare('SELECT bracket_data, results_data FROM tournaments ORDER BY year DESC LIMIT 1')
    .get() as TournamentRow | undefined;

  // Get user's groups
  const groups = db
    .prepare(
      `SELECT DISTINCT g.id, g.name, g.scoring_settings FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       JOIN predictions p ON p.id = gm.prediction_id
       WHERE p.user_id = ?`
    )
    .all(userRow.id) as GroupRow[];

  // Get member counts for those groups
  const groupIds = groups.map((g) => g.id);
  const memberCounts: Record<string, number> = {};
  if (groupIds.length > 0) {
    const placeholders = groupIds.map(() => '?').join(',');
    const counts = db
      .prepare(`SELECT group_id, COUNT(*) as cnt FROM group_members WHERE group_id IN (${placeholders}) GROUP BY group_id`)
      .all(...groupIds) as MemberCountRow[];
    for (const c of counts) memberCounts[c.group_id] = c.cnt;
  }

  // Get prediction
  const prediction = db
    .prepare(
      `SELECT id, bracket_name, group_predictions, third_place_picks, knockout_picks, tiebreaker
       FROM predictions WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1`
    )
    .get(userRow.id) as PredictionRow | undefined;

  // Score per group
  const groupScores: Array<{
    groupId: string;
    groupName: string;
    totalScore: number;
    groupStageScore: number;
    knockoutScore: number;
    bonusPoints: number;
    rank: number;
    totalMembers: number;
    percentile: number;
    perfectGroups: number;
    contrarianPicks: number;
    hotStreak: number;
  }> = [];

  if (prediction && tournament) {
    const bracketData = JSON.parse(tournament.bracket_data) as BracketData;
    const resultsData = JSON.parse(tournament.results_data) as TournamentResults;
    const groupStageResults = resultsData.groupStage;
    const knockoutResults = resultsData.knockout;
    const knockoutMatchups = resultsData.knockoutBracket;

    const gp = JSON.parse(prediction.group_predictions) as GroupPrediction[];
    const tp = JSON.parse(prediction.third_place_picks) as string[];
    const kp = JSON.parse(prediction.knockout_picks) as Record<string, string>;

    for (const group of groups) {
      const settings = JSON.parse(group.scoring_settings) as ScoringSettings;
      const hasValid = settings.groupStage && settings.knockout;
      const scoring = hasValid ? settings : DEFAULT_SCORING;

      const result = scoreTotalPrediction(
        gp, tp, kp, groupStageResults, knockoutResults, knockoutMatchups, bracketData, scoring,
      );

      const groupUpset = result.groupStageDetail.perGroup.reduce((s, g) => s + g.upsetBonusPoints, 0);
      const knockoutUpset = result.knockoutDetail
        ? result.knockoutDetail.perRound.reduce((s, r) => s + r.upsetBonusPoints, 0) : 0;

      // Get rank in this group
      const allPreds = db
        .prepare(
          `SELECT p.id, p.user_id, p.bracket_name, p.group_predictions, p.third_place_picks, p.knockout_picks, p.tiebreaker
           FROM predictions p
           JOIN group_members gm ON gm.prediction_id = p.id
           WHERE gm.group_id = ?`
        )
        .all(group.id) as (PredictionRow & { user_id: string })[];

      const scores = allPreds.map((ap) => {
        const r = scoreTotalPrediction(
          JSON.parse(ap.group_predictions), JSON.parse(ap.third_place_picks),
          JSON.parse(ap.knockout_picks), groupStageResults, knockoutResults,
          knockoutMatchups, bracketData, scoring,
        );
        return { userId: ap.user_id, total: r.totalScore, tiebreaker: ap.tiebreaker };
      });
      scores.sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (a.tiebreaker != null && b.tiebreaker != null) return a.tiebreaker - b.tiebreaker;
        return 0;
      });

      const rank = scores.findIndex((s) => s.userId === userRow.id) + 1;
      const totalMembers = scores.length;
      const percentile = totalMembers > 1 ? Math.round((1 - (rank - 1) / (totalMembers - 1)) * 100) : 100;

      // Indicators
      const allParsed = allPreds.map((ap) => ({
        group_predictions: JSON.parse(ap.group_predictions) as GroupPrediction[],
        third_place_picks: JSON.parse(ap.third_place_picks) as string[],
        knockout_picks: JSON.parse(ap.knockout_picks) as Record<string, string>,
      }));
      const parsed = { group_predictions: gp, third_place_picks: tp, knockout_picks: kp };
      const indicators = calculateIndicators(parsed, allParsed, groupStageResults, knockoutResults, knockoutMatchups);

      groupScores.push({
        groupId: group.id,
        groupName: group.name,
        totalScore: result.totalScore,
        groupStageScore: result.groupStageScore,
        knockoutScore: result.knockoutScore,
        bonusPoints: groupUpset + knockoutUpset,
        rank,
        totalMembers,
        percentile,
        perfectGroups: indicators.perfectGroups,
        contrarianPicks: indicators.contrarianPicks,
        hotStreak: indicators.hotStreak,
      });
    }
  }

  // Champion pick
  let championPick: string | null = null;
  if (prediction) {
    const kp = JSON.parse(prediction.knockout_picks) as Record<string, string>;
    championPick = kp['FINAL'] ?? null;
  }

  return NextResponse.json({
    ok: true,
    profile: {
      username: userRow.username,
      createdAt: userRow.created_at,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: memberCounts[g.id] ?? 0,
      })),
      prediction: prediction ? {
        bracketName: prediction.bracket_name,
        groupPredictions: JSON.parse(prediction.group_predictions),
        thirdPlacePicks: JSON.parse(prediction.third_place_picks),
        knockoutPicks: JSON.parse(prediction.knockout_picks),
        tiebreaker: prediction.tiebreaker,
      } : null,
      groupScores,
      championPick,
    },
  });
}

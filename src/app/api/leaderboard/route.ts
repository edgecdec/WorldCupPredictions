import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { scoreTotalPrediction } from '@/lib/scoring';
import { calculateMaxPossible } from '@/lib/maxPossible';
import { calculateIndicators } from '@/lib/leaderboardIndicators';
import { getPhase } from '@/lib/tournamentPhase';
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
  id: string;
  name: string;
  year: number;
  lock_time_groups: string | null;
  lock_time_knockout: string | null;
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
    .prepare('SELECT id, name, year, lock_time_groups, lock_time_knockout, bracket_data, results_data FROM tournaments ORDER BY year DESC LIMIT 1')
    .get() as TournamentRow | undefined;
  if (!tournament) {
    return NextResponse.json({ error: 'No tournament found' }, { status: 404 });
  }

  const bracketData = JSON.parse(tournament.bracket_data) as BracketData;
  const resultsData = JSON.parse(tournament.results_data) as TournamentResults;

  const phase = getPhase({
    id: tournament.id,
    name: tournament.name,
    year: tournament.year,
    lock_time_groups: tournament.lock_time_groups,
    lock_time_knockout: tournament.lock_time_knockout,
    bracket_data: bracketData,
    results_data: tournament.results_data,
  });
  const isPreTournament = phase === 'pre-tournament';
  const isPreKnockout = isPreTournament || phase === 'group-stage';
  // Knockout picks are "locked in" only once the knockout phase has begun.
  // Before then, users can still change their knockout picks, so Exp Pts
  // shouldn't include their projected knockout-pick scoring.
  const knockoutsLocked = phase === 'knockout' || phase === 'complete';
  const isAdmin = authUser.isAdmin;

  const groupStageResults: GroupStageResults | undefined = resultsData.groupStage;
  const knockoutResults: KnockoutResults | undefined = resultsData.knockout;
  const knockoutMatchups: KnockoutMatchup[] | undefined = resultsData.knockoutBracket;

  // Determine which groups are fully complete (6 matches each).
  // resultsData may have a `groupMatches` field tracked by the ESPN sync.
  const resultsWithMatches = resultsData as TournamentResults & {
    groupMatches?: Record<string, Array<{ teamA: string; teamB: string }>>;
  };
  const groupsLocked: Record<string, boolean> = {};
  if (groupStageResults) {
    // If groupStage finalized standings exist, all groups are locked.
    for (const gr of groupStageResults.groupResults) groupsLocked[gr.groupName] = true;
  } else if (resultsWithMatches.groupMatches) {
    for (const [g, matches] of Object.entries(resultsWithMatches.groupMatches)) {
      groupsLocked[g] = matches.length >= 6;
    }
  }

  // Determine which knockout rounds are fully complete.
  // R32 has 16 matches, R16 has 8, QF has 4, SF has 2, 3RD has 1, FINAL has 1.
  const ROUND_MATCH_COUNTS: Record<string, number> = {
    R32: 16, R16: 8, QF: 4, SF: 2, '3RD': 1, FINAL: 1,
  };
  const roundsLocked: Record<string, boolean> = {};
  if (knockoutResults) {
    for (const [roundLabel, expectedCount] of Object.entries(ROUND_MATCH_COUNTS)) {
      let actualCount = 0;
      for (const matchId of Object.keys(knockoutResults)) {
        // Match IDs: 'R32-1', 'R16-3', 'QF-2', 'SF-1', '3RD', 'FINAL'
        if (matchId === roundLabel || matchId.startsWith(roundLabel + '-')) actualCount++;
      }
      roundsLocked[roundLabel] = actualCount >= expectedCount;
    }
  } else {
    for (const r of Object.keys(ROUND_MATCH_COUNTS)) roundsLocked[r] = false;
  }

  // Phase-level locks. A "phase fully locked" means every piece of that
  // phase's scoring is decided — at which point per-bucket cells can flip
  // from expected (italic decimal) to locked (bold integer).
  //
  // Group stage: all 12 group standings finalized AND the 8 advancing 3rd-
  // place teams known. Until then, each group's locked total still excludes
  // the 3rd-finisher's advanceCorrect + the advancementCorrectBonus, so the
  // cell should show expected.
  const TOTAL_GROUPS = 12;
  const groupsPhaseLocked = !!(
    groupStageResults
    && groupStageResults.groupResults.length === TOTAL_GROUPS
    && groupStageResults.advancingThirdPlace
    && groupStageResults.advancingThirdPlace.length === 8
  );
  // Knockout phase: the final result is known.
  const knockoutPhaseLocked = !!(knockoutResults && knockoutResults.FINAL);

  const predictions = db
    .prepare(
      `SELECT p.id, p.user_id, p.bracket_name, p.group_predictions,
              p.third_place_picks, p.knockout_picks, p.tiebreaker, u.username
       FROM predictions p
       JOIN users u ON p.user_id = u.id AND u.is_hidden = 0
       JOIN group_members gm ON gm.prediction_id = p.id
       WHERE gm.group_id = ?`
    )
    .all(groupId) as PredictionRow[];

  const leaderboard: LeaderboardEntry[] = predictions.map((p) => {
    const groupPredictions = JSON.parse(p.group_predictions) as GroupPrediction[];
    const thirdPlacePicks = JSON.parse(p.third_place_picks) as string[];
    const knockoutPicks = JSON.parse(p.knockout_picks) as Record<string, string>;

    const groupsFilled = groupPredictions.filter(g => g.order.every(t => t)).length;
    const thirdPlaceFilled = thirdPlacePicks.length;
    const knockoutFilled = Object.keys(knockoutPicks).length;

    // Pre-tournament: return completion data only, no scores or pick details
    if (isPreTournament && !isAdmin) {
      return {
        username: p.username,
        bracket_name: p.bracket_name,
        groupStageScore: 0,
        knockoutScore: 0,
        totalScore: 0,
        tiebreaker: null,
        completion: {
          groupsFilled,
          thirdPlaceFilled,
          knockoutFilled,
        },
      };
    }

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

    const groupUpsetBonus = result.groupStageDetail.perGroup.reduce(
      (sum, g) => sum + g.upsetBonusPoints, 0,
    );
    const knockoutUpsetBonus = result.knockoutDetail
      ? result.knockoutDetail.perRound.reduce((sum, r) => sum + r.upsetBonusPoints, 0)
      : 0;

    // Build per-group locked scores. A group is locked when its 6 matches are
    // all complete; only then is the group's score truly final.
    const groupScoresLocked: Record<string, number> = {};
    for (const gd of result.groupStageDetail.perGroup) {
      if (groupsLocked[gd.groupName]) groupScoresLocked[gd.groupName] = gd.total;
    }

    // Build per-round locked scores.
    const roundScoresLocked: Record<string, number> = {};
    if (result.knockoutDetail) {
      for (const rd of result.knockoutDetail.perRound) {
        // rd.round is the label string ('R32', 'R16', etc.) per scoring.ts:195.
        if (roundsLocked[rd.round]) roundScoresLocked[rd.round] = rd.total;
      }
    }

    const entry: LeaderboardEntry = {
      username: p.username,
      bracket_name: p.bracket_name,
      groupStageScore: result.groupStageScore,
      knockoutScore: result.knockoutScore,
      totalScore: result.totalScore,
      tiebreaker: p.tiebreaker,
      maxPossible: maxResult.maxTotal,
      championEliminated: maxResult.championEliminated,
      bonusPoints: groupUpsetBonus + knockoutUpsetBonus,
      groupScoresLocked,
      roundScoresLocked,
      groupsLocked,
      roundsLocked,
      prediction: {
        id: p.id,
        user_id: p.user_id,
        bracket_name: p.bracket_name,
        group_predictions: groupPredictions,
        third_place_picks: thirdPlacePicks,
        knockout_picks: knockoutPicks,
        tiebreaker: p.tiebreaker,
      },
      completion: {
        groupsFilled,
        thirdPlaceFilled,
        knockoutFilled,
      },
    };

    // Pre-knockout: strip knockout pick details
    if (isPreKnockout && !isAdmin && entry.prediction) {
      entry.prediction.knockout_picks = {};
    }

    return entry;
  });

  leaderboard.sort((a, b) => {
    if (isPreTournament && !isAdmin) {
      // Sort by completion (most complete first)
      const aComplete = (a.completion?.groupsFilled ?? 0) + (a.completion?.thirdPlaceFilled ?? 0);
      const bComplete = (b.completion?.groupsFilled ?? 0) + (b.completion?.thirdPlaceFilled ?? 0);
      return bComplete - aComplete;
    }
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (a.tiebreaker != null && b.tiebreaker != null) return a.tiebreaker - b.tiebreaker;
    if (a.tiebreaker != null) return -1;
    if (b.tiebreaker != null) return 1;
    return 0;
  });

  if (!isPreTournament || isAdmin) {
    const leaderScore = leaderboard.length > 0 ? leaderboard[0].totalScore : 0;
    const totalMembers = leaderboard.length;
    // Competition ranking: tied entries share the lowest rank in their tie group.
    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i];
      entry.eliminated = (entry.maxPossible ?? 0) < leaderScore;
      // How many entries strictly outscore this one? (Same total + same tiebreaker
      // doesn't beat us; lower tiebreaker beats us when totals are tied.)
      const strictlyAhead = leaderboard.filter((other) => {
        if (other.totalScore > entry.totalScore) return true;
        if (other.totalScore < entry.totalScore) return false;
        if (other.tiebreaker != null && entry.tiebreaker != null) {
          return other.tiebreaker < entry.tiebreaker;
        }
        return false;
      }).length;
      const rank = strictlyAhead + 1;
      // "Top X%" — lower is better. rank 1 of 10 → Top 10%. rank 10 of 10 → Top 100%.
      entry.percentile = totalMembers > 0
        ? Math.max(1, Math.round((rank / totalMembers) * 100))
        : 100;
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
  }

  return NextResponse.json({
    leaderboard,
    scoring_settings: scoringSettings,
    results: resultsData,
    bracket_data: bracketData,
    phase,
    groupsPhaseLocked,
    knockoutPhaseLocked,
    knockoutsLocked,
  });
}

import { describe, it, expect } from 'vitest';
import { scoreGroupStage, scoreKnockout, scoreTotalPrediction } from '@/lib/scoring';
import {
  BracketData,
  GroupPrediction,
  GroupStageResults,
  KnockoutMatchup,
  KnockoutResults,
  DEFAULT_SCORING,
  GroupStageScoringSettings,
  KnockoutScoringSettings,
} from '@/types';

// --- Test fixtures ---

const BRACKET_DATA: BracketData = {
  groups: [
    {
      name: 'A',
      teams: [
        { name: 'TeamA1', fifaRanking: 5, pot: 1, groupSeed: 1, espnId: 1001 },
        { name: 'TeamA2', fifaRanking: 20, pot: 2, groupSeed: 2, espnId: 1002 },
        { name: 'TeamA3', fifaRanking: 50, pot: 3, groupSeed: 3, espnId: 1003 },
        { name: 'TeamA4', fifaRanking: 80, pot: 4, groupSeed: 4, espnId: 1004 },
      ],
    },
    {
      name: 'B',
      teams: [
        { name: 'TeamB1', fifaRanking: 3, pot: 1, groupSeed: 1, espnId: 2001 },
        { name: 'TeamB2', fifaRanking: 15, pot: 2, groupSeed: 2, espnId: 2002 },
        { name: 'TeamB3', fifaRanking: 45, pot: 3, groupSeed: 3, espnId: 2003 },
        { name: 'TeamB4', fifaRanking: 90, pot: 4, groupSeed: 4, espnId: 2004 },
      ],
    },
  ],
};

const DEFAULT_GROUP_SETTINGS = DEFAULT_SCORING.groupStage;
const DEFAULT_KO_SETTINGS = DEFAULT_SCORING.knockout;

// --- Group Stage Tests ---

describe('scoreGroupStage', () => {
  it('scores perfect prediction (all positions correct, advance correct)', () => {
    const predictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] },
    ];
    const results: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] }],
      advancingThirdPlace: ['TeamA3'],
    };
    const thirdPlacePicks = ['TeamA3'];

    const score = scoreGroupStage(predictions, thirdPlacePicks, results, BRACKET_DATA, DEFAULT_GROUP_SETTINGS);

    // 4 advance correct (1 each) + 4 exact position (1 each) + 0 upset + 1 advancement bonus + 2 perfect order
    expect(score.total).toBe(11);
    expect(score.perGroup[0].advanceCorrectPoints).toBe(4);
    expect(score.perGroup[0].exactPositionPoints).toBe(4);
    expect(score.perGroup[0].upsetBonusPoints).toBe(0);
    expect(score.perGroup[0].advancementCorrectBonus).toBe(1);
    expect(score.perGroup[0].perfectOrderBonus).toBe(2);
  });

  it('scores advance_correct for correct advance/not-advance calls', () => {
    // Predict: A1(1st), A2(2nd), A3(3rd), A4(4th) — A3 NOT in third place picks
    // Actual: A1(1st), A2(2nd), A3(3rd not advancing), A4(4th)
    const predictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] },
    ];
    const results: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] }],
      advancingThirdPlace: [], // A3 does NOT advance
    };
    const thirdPlacePicks: string[] = []; // User did NOT pick A3 to advance

    const score = scoreGroupStage(predictions, thirdPlacePicks, results, BRACKET_DATA, DEFAULT_GROUP_SETTINGS);

    // All 4 advance calls correct (A1 advance=yes, A2 advance=yes, A3 predicted not-advance & actual not-advance, A4 not-advance)
    expect(score.perGroup[0].advanceCorrectPoints).toBe(4);
  });

  it('penalizes wrong advance call for 3rd place team', () => {
    // User picks A3 as advancing 3rd, but A3 doesn't actually advance
    const predictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] },
    ];
    const results: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] }],
      advancingThirdPlace: [], // A3 does NOT advance
    };
    const thirdPlacePicks = ['TeamA3']; // User predicted A3 advances — WRONG

    const score = scoreGroupStage(predictions, thirdPlacePicks, results, BRACKET_DATA, DEFAULT_GROUP_SETTINGS);

    // A3: predicted advance (3rd + in picks), actual not-advance → wrong
    expect(score.perGroup[0].advanceCorrectPoints).toBe(3);
    expect(score.perGroup[0].advancementCorrectBonus).toBe(0);
  });

  it('awards exact position points only for correct positions', () => {
    // Predict: A1, A2, A3, A4 — Actual: A2, A1, A3, A4
    const predictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] },
    ];
    const results: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA2', 'TeamA1', 'TeamA3', 'TeamA4'] }],
      advancingThirdPlace: [],
    };

    const score = scoreGroupStage(predictions, [], results, BRACKET_DATA, DEFAULT_GROUP_SETTINGS);

    // A1 predicted 1st, actual 2nd → no. A2 predicted 2nd, actual 1st → no. A3 correct. A4 correct.
    expect(score.perGroup[0].exactPositionPoints).toBe(2);
    expect(score.perGroup[0].perfectOrderBonus).toBe(0);
  });

  it('awards upset bonus capped at prediction, not actual finish', () => {
    // Seed 4 (TeamA4) predicted 2nd, finishes 1st → bonus = seed(4) - predicted(2) = 2 (NOT 3)
    const predictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA1', 'TeamA4', 'TeamA3', 'TeamA2'] },
    ];
    const results: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA4', 'TeamA1', 'TeamA3', 'TeamA2'] }],
      advancingThirdPlace: [],
    };

    const score = scoreGroupStage(predictions, [], results, BRACKET_DATA, DEFAULT_GROUP_SETTINGS);

    // TeamA4: seed=4, predicted=2nd, actual=1st. actual(1) <= predicted(2) → bonus = 4-2 = 2
    expect(score.perGroup[0].upsetBonusPoints).toBe(2);
  });

  it('denies upset bonus when team finishes below prediction', () => {
    // Seed 4 (TeamA4) predicted 2nd, finishes 3rd → no bonus
    const predictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA1', 'TeamA4', 'TeamA3', 'TeamA2'] },
    ];
    const results: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA1', 'TeamA3', 'TeamA4', 'TeamA2'] }],
      advancingThirdPlace: [],
    };

    const score = scoreGroupStage(predictions, [], results, BRACKET_DATA, DEFAULT_GROUP_SETTINGS);

    // TeamA4: predicted 2nd, actual 3rd → 3 > 2, no bonus
    // TeamA3: seed=3, predicted 3rd, actual 2nd → actual(2) <= predicted(3) → bonus = 3-3 = 0
    expect(score.perGroup[0].upsetBonusPoints).toBe(0);
  });

  it('awards upset bonus for seed 3 predicted 1st finishing 1st', () => {
    const predictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA3', 'TeamA1', 'TeamA2', 'TeamA4'] },
    ];
    const results: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA3', 'TeamA1', 'TeamA2', 'TeamA4'] }],
      advancingThirdPlace: [],
    };

    const score = scoreGroupStage(predictions, [], results, BRACKET_DATA, DEFAULT_GROUP_SETTINGS);

    // TeamA3: seed=3, predicted=1st, actual=1st → bonus = 3-1 = 2
    expect(score.perGroup[0].upsetBonusPoints).toBe(2);
  });

  it('gives no upset bonus for seed 1 team (seed - position always <= 0)', () => {
    const predictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] },
    ];
    const results: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] }],
      advancingThirdPlace: [],
    };

    const score = scoreGroupStage(predictions, [], results, BRACKET_DATA, DEFAULT_GROUP_SETTINGS);

    // TeamA1: seed=1, predicted=1st → max(0, 1-1) = 0
    expect(score.perGroup[0].upsetBonusPoints).toBe(0);
  });

  it('awards advancement correct bonus independently of perfect order', () => {
    // All advance/not-advance correct, but positions wrong
    // Predict: A2, A1, A3, A4 — Actual: A1, A2, A3, A4
    // Advance: A2 predicted advance (2nd→1st), actual advance (2nd) ✓
    //          A1 predicted advance (1st→2nd), actual advance (1st) ✓
    //          A3 predicted not-advance (3rd, not in picks), actual not-advance ✓
    //          A4 predicted not-advance (4th), actual not-advance ✓
    const predictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA2', 'TeamA1', 'TeamA3', 'TeamA4'] },
    ];
    const results: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] }],
      advancingThirdPlace: [],
    };

    const score = scoreGroupStage(predictions, [], results, BRACKET_DATA, DEFAULT_GROUP_SETTINGS);

    expect(score.perGroup[0].advancementCorrectBonus).toBe(1);
    expect(score.perGroup[0].perfectOrderBonus).toBe(0); // positions swapped
  });

  it('awards perfect order bonus independently of advancement correct', () => {
    // All 4 positions correct, but 3rd place advance call wrong
    const predictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] },
    ];
    const results: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] }],
      advancingThirdPlace: ['TeamA3'], // A3 actually advances
    };
    const thirdPlacePicks: string[] = []; // User did NOT pick A3 → wrong advance call

    const score = scoreGroupStage(predictions, thirdPlacePicks, results, BRACKET_DATA, DEFAULT_GROUP_SETTINGS);

    expect(score.perGroup[0].perfectOrderBonus).toBe(2);
    expect(score.perGroup[0].advancementCorrectBonus).toBe(0); // A3 advance call wrong
  });

  it('scores multiple groups and sums totals', () => {
    const predictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] },
      { groupName: 'B', order: ['TeamB1', 'TeamB2', 'TeamB3', 'TeamB4'] },
    ];
    const results: GroupStageResults = {
      groupResults: [
        { groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] },
        { groupName: 'B', order: ['TeamB1', 'TeamB2', 'TeamB3', 'TeamB4'] },
      ],
      advancingThirdPlace: [],
    };

    const score = scoreGroupStage(predictions, [], results, BRACKET_DATA, DEFAULT_GROUP_SETTINGS);

    expect(score.perGroup).toHaveLength(2);
    // Each group: 4 advance + 4 exact + 0 upset + 1 advancement + 2 perfect = 11
    expect(score.total).toBe(22);
  });

  it('handles missing prediction for a group gracefully', () => {
    const predictions: GroupPrediction[] = []; // No predictions at all
    const results: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] }],
      advancingThirdPlace: [],
    };

    const score = scoreGroupStage(predictions, [], results, BRACKET_DATA, DEFAULT_GROUP_SETTINGS);

    expect(score.total).toBe(0);
    expect(score.perGroup).toHaveLength(0);
  });

  it('respects custom scoring settings', () => {
    const customSettings: GroupStageScoringSettings = {
      advanceCorrect: 2,
      exactPosition: 3,
      upsetBonusPerPlace: 5,
      advancementCorrectBonus: 10,
      perfectOrderBonus: 20,
    };
    const predictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] },
    ];
    const results: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] }],
      advancingThirdPlace: [],
    };

    const score = scoreGroupStage(predictions, [], results, BRACKET_DATA, customSettings);

    // 4*2 advance + 4*3 exact + 0 upset + 10 advancement + 20 perfect = 8+12+10+20 = 50
    expect(score.total).toBe(50);
  });
});

// --- Knockout Tests ---

describe('scoreKnockout', () => {
  const makeMatchup = (id: string, round: number, teamA: string, teamB: string): KnockoutMatchup => ({
    id,
    round,
    teamA,
    teamB,
    winner: null,
  });

  it('awards base points for correct pick in R32', () => {
    const matchups = [makeMatchup('R32-1', 0, 'TeamA1', 'TeamB4')];
    const results: KnockoutResults = { 'R32-1': 'TeamA1' };
    const picks = { 'R32-1': 'TeamA1' };

    const score = scoreKnockout(picks, results, matchups, BRACKET_DATA, DEFAULT_KO_SETTINGS);

    expect(score.perRound[0].basePoints).toBe(3);
    expect(score.total).toBe(3);
  });

  it('awards zero for incorrect pick', () => {
    const matchups = [makeMatchup('R32-1', 0, 'TeamA1', 'TeamB4')];
    const results: KnockoutResults = { 'R32-1': 'TeamA1' };
    const picks = { 'R32-1': 'TeamB4' }; // Wrong

    const score = scoreKnockout(picks, results, matchups, BRACKET_DATA, DEFAULT_KO_SETTINGS);

    expect(score.perRound[0].basePoints).toBe(0);
    expect(score.total).toBe(0);
  });

  it('awards upset bonus using FIFA ranking difference and modulus', () => {
    // TeamB4 (rank 90) beats TeamB1 (rank 3), user predicted it, R32
    // rankDiff = 90 - 3 = 87, floor(87/10) * 1 = 8
    const matchups = [makeMatchup('R32-1', 0, 'TeamB1', 'TeamB4')];
    const results: KnockoutResults = { 'R32-1': 'TeamB4' };
    const picks = { 'R32-1': 'TeamB4' };

    const score = scoreKnockout(picks, results, matchups, BRACKET_DATA, DEFAULT_KO_SETTINGS);

    expect(score.perRound[0].basePoints).toBe(3);
    expect(score.perRound[0].upsetBonusPoints).toBe(8);
    expect(score.total).toBe(11);
  });

  it('applies round-specific multiplier to upset bonus', () => {
    // QF (round 2, multiplier 2): TeamA4 (rank 80) beats TeamA1 (rank 5)
    // rankDiff = 80 - 5 = 75, floor(75/10) * 2 = 7 * 2 = 14
    const matchups = [makeMatchup('QF-1', 2, 'TeamA1', 'TeamA4')];
    const results: KnockoutResults = { 'QF-1': 'TeamA4' };
    const picks = { 'QF-1': 'TeamA4' };

    const score = scoreKnockout(picks, results, matchups, BRACKET_DATA, DEFAULT_KO_SETTINGS);

    expect(score.perRound[2].basePoints).toBe(8);
    expect(score.perRound[2].upsetBonusPoints).toBe(14);
    expect(score.total).toBe(22);
  });

  it('gives no upset bonus when higher-ranked team wins', () => {
    // TeamA1 (rank 5) beats TeamA4 (rank 80) — not an upset
    const matchups = [makeMatchup('R32-1', 0, 'TeamA1', 'TeamA4')];
    const results: KnockoutResults = { 'R32-1': 'TeamA1' };
    const picks = { 'R32-1': 'TeamA1' };

    const score = scoreKnockout(picks, results, matchups, BRACKET_DATA, DEFAULT_KO_SETTINGS);

    expect(score.perRound[0].upsetBonusPoints).toBe(0);
  });

  it('gives no upset bonus when user picked wrong even if upset occurred', () => {
    // TeamA4 beats TeamA1 (upset), but user picked TeamA1
    const matchups = [makeMatchup('R32-1', 0, 'TeamA1', 'TeamA4')];
    const results: KnockoutResults = { 'R32-1': 'TeamA4' };
    const picks = { 'R32-1': 'TeamA1' };

    const score = scoreKnockout(picks, results, matchups, BRACKET_DATA, DEFAULT_KO_SETTINGS);

    expect(score.perRound[0].upsetBonusPoints).toBe(0);
    expect(score.perRound[0].basePoints).toBe(0);
  });

  it('awards champion bonus for correct Final pick', () => {
    const matchups = [makeMatchup('FINAL', 5, 'TeamA1', 'TeamB1')];
    const results: KnockoutResults = { FINAL: 'TeamA1' };
    const picks = { FINAL: 'TeamA1' };

    const score = scoreKnockout(picks, results, matchups, BRACKET_DATA, DEFAULT_KO_SETTINGS);

    expect(score.championBonus).toBe(5);
    expect(score.perRound[5].basePoints).toBe(21);
    expect(score.total).toBe(26); // 21 base + 5 champion
  });

  it('does not award champion bonus for wrong Final pick', () => {
    const matchups = [makeMatchup('FINAL', 5, 'TeamA1', 'TeamB1')];
    const results: KnockoutResults = { FINAL: 'TeamA1' };
    const picks = { FINAL: 'TeamB1' };

    const score = scoreKnockout(picks, results, matchups, BRACKET_DATA, DEFAULT_KO_SETTINGS);

    expect(score.championBonus).toBe(0);
    expect(score.total).toBe(0);
  });

  it('scores multiple rounds correctly', () => {
    const matchups = [
      makeMatchup('R32-1', 0, 'TeamA1', 'TeamB4'),
      makeMatchup('R16-1', 1, 'TeamA1', 'TeamA2'),
      makeMatchup('QF-1', 2, 'TeamA1', 'TeamB1'),
    ];
    const results: KnockoutResults = {
      'R32-1': 'TeamA1',
      'R16-1': 'TeamA1',
      'QF-1': 'TeamA1',
    };
    const picks = {
      'R32-1': 'TeamA1',
      'R16-1': 'TeamA1',
      'QF-1': 'TeamA1',
    };

    const score = scoreKnockout(picks, results, matchups, BRACKET_DATA, DEFAULT_KO_SETTINGS);

    expect(score.perRound[0].basePoints).toBe(3);
    expect(score.perRound[1].basePoints).toBe(5);
    expect(score.perRound[2].basePoints).toBe(8);
    expect(score.total).toBe(16);
  });

  it('handles unplayed matches (no result yet)', () => {
    const matchups = [
      makeMatchup('R32-1', 0, 'TeamA1', 'TeamB4'),
      makeMatchup('R32-2', 0, 'TeamA2', 'TeamB3'),
    ];
    const results: KnockoutResults = { 'R32-1': 'TeamA1' }; // R32-2 not played
    const picks = { 'R32-1': 'TeamA1', 'R32-2': 'TeamA2' };

    const score = scoreKnockout(picks, results, matchups, BRACKET_DATA, DEFAULT_KO_SETTINGS);

    expect(score.perRound[0].basePoints).toBe(3); // Only R32-1 scored
  });

  it('respects custom knockout settings', () => {
    const customSettings: KnockoutScoringSettings = {
      pointsPerRound: [10, 20, 30, 40, 40, 50],
      upsetMultiplierPerRound: [2, 2, 4, 4, 2, 6],
      upsetModulus: 5,
      championBonus: 100,
    };
    // TeamA4 (rank 80) beats TeamA1 (rank 5) in R32
    // rankDiff = 75, floor(75/5) * 2 = 15 * 2 = 30
    const matchups = [makeMatchup('R32-1', 0, 'TeamA1', 'TeamA4')];
    const results: KnockoutResults = { 'R32-1': 'TeamA4' };
    const picks = { 'R32-1': 'TeamA4' };

    const score = scoreKnockout(picks, results, matchups, BRACKET_DATA, customSettings);

    expect(score.perRound[0].basePoints).toBe(10);
    expect(score.perRound[0].upsetBonusPoints).toBe(30);
    expect(score.total).toBe(40);
  });

  it('handles 3rd place match (round 4)', () => {
    const matchups = [makeMatchup('3RD', 4, 'TeamA2', 'TeamB2')];
    const results: KnockoutResults = { '3RD': 'TeamA2' };
    const picks = { '3RD': 'TeamA2' };

    const score = scoreKnockout(picks, results, matchups, BRACKET_DATA, DEFAULT_KO_SETTINGS);

    expect(score.perRound[4].basePoints).toBe(13);
    expect(score.championBonus).toBe(0); // Not the final
  });
});

// --- Integration: scoreTotalPrediction ---

describe('scoreTotalPrediction', () => {
  it('combines group stage and knockout scores', () => {
    const groupPredictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] },
    ];
    const thirdPlacePicks: string[] = [];
    const groupStageResults: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] }],
      advancingThirdPlace: [],
    };
    const matchups: KnockoutMatchup[] = [
      { id: 'R32-1', round: 0, teamA: 'TeamA1', teamB: 'TeamB4', winner: null },
    ];
    const knockoutResults: KnockoutResults = { 'R32-1': 'TeamA1' };
    const knockoutPicks = { 'R32-1': 'TeamA1' };

    const result = scoreTotalPrediction(
      groupPredictions,
      thirdPlacePicks,
      knockoutPicks,
      groupStageResults,
      knockoutResults,
      matchups,
      BRACKET_DATA,
    );

    // Group: 4 advance + 4 exact + 0 upset + 1 advancement + 2 perfect = 11
    // Knockout: 3 base
    expect(result.groupStageScore).toBe(11);
    expect(result.knockoutScore).toBe(3);
    expect(result.totalScore).toBe(14);
    expect(result.groupStageDetail.perGroup).toHaveLength(1);
    expect(result.knockoutDetail).not.toBeNull();
  });

  it('returns zero knockout score when no knockout results', () => {
    const groupPredictions: GroupPrediction[] = [
      { groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] },
    ];
    const groupStageResults: GroupStageResults = {
      groupResults: [{ groupName: 'A', order: ['TeamA1', 'TeamA2', 'TeamA3', 'TeamA4'] }],
      advancingThirdPlace: [],
    };

    const result = scoreTotalPrediction(
      groupPredictions,
      [],
      {},
      groupStageResults,
      undefined,
      undefined,
      BRACKET_DATA,
    );

    expect(result.groupStageScore).toBe(11);
    expect(result.knockoutScore).toBe(0);
    expect(result.knockoutDetail).toBeNull();
    expect(result.totalScore).toBe(11);
  });

  it('returns zero group score when no group results', () => {
    const result = scoreTotalPrediction(
      [],
      [],
      {},
      undefined,
      undefined,
      undefined,
      BRACKET_DATA,
    );

    expect(result.groupStageScore).toBe(0);
    expect(result.knockoutScore).toBe(0);
    expect(result.totalScore).toBe(0);
  });
});

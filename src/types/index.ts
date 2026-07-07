// Shared types used across client and server

export interface User {
  id: string;
  username: string;
  is_admin: boolean;
}

export interface AuthUser {
  userId: string;
  username: string;
  isAdmin: boolean;
}

export interface Team {
  name: string;
  logo?: string;
  fifaRanking: number;
  pot: 1 | 2 | 3 | 4;
  groupSeed: 1 | 2 | 3 | 4;
  espnId: number;
  countryCode?: string; // ISO 3166-1 alpha-2 lowercase, e.g. 'mx' for Mexico
}

export interface Group {
  name: string;
  teams: [Team, Team, Team, Team];
}

export interface BracketData {
  groups: Group[];
}

export interface Tournament {
  id: string;
  name: string;
  year: number;
  lock_time_groups: string | null;
  lock_time_knockout: string | null;
  bracket_data: string | BracketData;
  results_data: string | Record<string, unknown>;
}

export interface GroupStageScoringSettings {
  advanceCorrect: number;
  exactPosition: number;
  upsetBonusPerPlace: number;
  advancementCorrectBonus: number;
  perfectOrderBonus: number;
}

export interface KnockoutScoringSettings {
  pointsPerRound: number[];      // [R32, R16, QF, SF, 3RD, FINAL]
  upsetMultiplierPerRound: number[];
  upsetModulus: number;
}

export interface ScoringSettings {
  groupStage: GroupStageScoringSettings;
  knockout: KnockoutScoringSettings;
}

export const DEFAULT_SCORING: ScoringSettings = {
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
  },
};

export interface GroupStageResults {
  groupResults: Array<{ groupName: string; order: [string, string, string, string] }>;
  advancingThirdPlace: string[];
}

export type KnockoutResults = Record<string, string>;

export interface TournamentResults {
  groupStage?: GroupStageResults;
  knockout?: KnockoutResults;
  knockoutBracket?: KnockoutMatchup[];
}

export interface GroupPrediction {
  groupName: string;
  order: [string, string, string, string]; // team names in predicted finish order
}

export interface UserPrediction {
  id: string;
  user_id: string;
  tournament_id: string;
  bracket_name: string;
  group_predictions: GroupPrediction[];
  third_place_picks: string[];  // 8 team names predicted to advance as best 3rd
  knockout_picks: Record<string, string>;  // matchup_id -> winning team name
  tiebreaker: number | null;
  submitted_at: string;
}

export interface GroupConfig {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
  scoring_settings: string | ScoringSettings;
  max_brackets: number | null;
  submissions_locked: boolean;
}

export interface LeaderboardEntry {
  username: string;
  bracket_name: string;
  groupStageScore: number;
  knockoutScore: number;
  totalScore: number;
  tiebreaker: number | null;
  maxPossible?: number;
  championEliminated?: boolean;
  eliminated?: boolean;
  percentile?: number;
  bonusPoints?: number;
  perfectGroups?: number;
  hotStreak?: number;
  contrarianPicks?: number;
  /** Forecast total expected score (from worker). Used as secondary sort when
   *  totalScore is tied (which it will be early in the tournament). */
  expectedScore?: number;
  /** How many of the 8 advancing third-place teams the user picked correctly.
   *  Only meaningful once the group stage is fully decided. */
  thirdPlaceCorrect?: number;
  /** Total bonus points across all groups (advancementCorrectBonus +
   *  perfectOrderBonus + upsetBonusPoints). Surfaced separately for the
   *  Groups tab so users can see how much came from bonuses vs base. */
  groupBonusPoints?: number;
  /** Locked actual points per group (only when group is fully complete). */
  groupScoresLocked?: Record<string, number>;
  /** Forecast expected points per group (always available once worker runs). */
  groupScoresExpected?: Record<string, number>;
  /** Locked actual points per knockout round (only when round complete). */
  roundScoresLocked?: Record<string, number>;
  /** Forecast expected points per knockout round (from worker). */
  roundScoresExpected?: Record<string, number>;
  /** Per-group lock state — true if that group's results are final. */
  groupsLocked?: Record<string, boolean>;
  /** Per-round lock state. */
  roundsLocked?: Record<string, boolean>;
  completion?: {
    groupsFilled: number;
    thirdPlaceFilled: number;
    knockoutFilled: number;
  };
  prediction?: {
    id: string;
    user_id: string;
    bracket_name: string;
    group_predictions: GroupPrediction[];
    third_place_picks: string[];
    knockout_picks: Record<string, string>;
    tiebreaker: number | null;
  };
}

export interface KnockoutMatchup {
  id: string;
  round: number;  // 0=R32, 1=R16, 2=QF, 3=SF, 4=3rd, 5=Final
  teamA: string | null;
  teamB: string | null;
  winner: string | null;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  username: string;
  message: string;
  created_at: string;
}

export interface LiveGame {
  id: string;
  name: string;
  status: string;
  detail: string;
  state: string;
  clock: string;
  period: number;
  /** ISO 8601 kickoff time (e.g. "2026-06-11T19:00Z"). */
  date: string;
  home: { name: string; score: string; logo: string };
  away: { name: string; score: string; logo: string };
  /** 'group' for group-stage matches, 'knockout' for R32 onward, undefined if unknown. */
  stage?: 'group' | 'knockout';
  /** Venue name + city + country (e.g. "Estadio Banorte • Mexico City"). */
  venue?: string;
}

export const KNOCKOUT_ROUNDS = ['R32', 'R16', 'QF', 'SF', '3RD', 'FINAL'] as const;

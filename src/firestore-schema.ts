/**
 * Firestore Schema for Pick 'Em App
 * Collections, documents, and TypeScript types
 *
 * DATE FIELDS: every timestamp field on a Firestore *Doc interface below is
 * typed as Timestamp, not Date — that's what actually gets written
 * (Timestamp.now() / Timestamp.fromDate()) and what actually comes back on a
 * read. The UI-facing types further down (UIGame, etc.) use real Date,
 * post-conversion — see toUIDate() in LeagueContext.tsx, which calls
 * Timestamp.toDate() rather than casting. Mixing these up compiles fine with
 * `as` casts but crashes at runtime the first time UI code calls a Date
 * method (toLocaleString(), etc.) on what's actually a Timestamp object.
 */

import { Timestamp } from "firebase/firestore";

// ============================================================================
// FIRESTORE COLLECTION STRUCTURE
// ============================================================================

/**
 * /leagues/{leagueId}
 * Top-level league document: metadata, settings
 */
export interface LeagueDoc {
  id: string;
  name: string;
  season: number; // 2025, etc.
  commissionerId: string;
  playerCount: number;
  currentWeek: number; // The week players/commissioner see by default on open.
                        // Advanced explicitly by the commissioner (setLeagueCurrentWeek) —
                        // not inferred from wall-clock time, since bye weeks and a
                        // fixed Week 0 test slate make date-based inference unreliable.
  createdAt: Timestamp;
  updatedAt: Timestamp;
  commissionerAuthCode: string; // Simple auth for commissioner console
}

/**
 * /leagues/{leagueId}/players/{playerId}
 * Player roster
 */
export interface PlayerDoc {
  id: string;
  leagueId: string;
  name: string;
  email?: string;
  isCommissioner: boolean;
  joinedAt: Timestamp;
  isWildcardPicker: boolean; // True if this is youngest son (auto-fills missed picks)
}

/**
 * /leagues/{leagueId}/games/{gameId}
 * Game schedule and static info
 *
 * SCHEDULE FLEX: The real NFL schedule isn't static. Sunday games can flex into
 * primetime, and the final 1-2 weeks of the season often don't get real days/times
 * until days before kickoff. `order` is the field that actually controls display
 * and pick-sheet position — it's set by the commissioner (reorderable any time) and
 * is INDEPENDENT of gameTime. `gameTime` is nullable and `timeTBD` is the honest
 * flag for "we don't know yet." Locking follows gameTime when it's known; for TBD
 * games there's nothing to lock automatically against, so `isManuallyLocked` is the
 * escape hatch the commissioner uses if a TBD game needs to close early (e.g. word
 * comes down that kickoff is imminent before the league's own schedule feed updates).
 */
export interface GameDoc {
  id: string;
  leagueId: string;
  week: number;
  order: number; // Display / pick-sheet position. Commissioner-controlled, reorderable any time.
  homeTeam: string; // Team abbreviation (e.g., "KC")
  awayTeam: string;
  gameTime: Timestamp | null; // Kickoff time. Null until the league (or commissioner) sets it.
  timeTBD: boolean; // True when gameTime is unknown/unset — common for flex games and late-season weeks.
  isPlayoff: boolean;
  playoffRound?: string; // "WildCard", "Divisional", "Championship", "SuperBowl"
  playoffMultiplier: number; // 1, 1.25, 1.5, 2
  isLocked: boolean; // True once kickoff passes (or set manually for a TBD game — see isManuallyLocked)
  isManuallyLocked?: boolean; // Commissioner override to lock a TBD game before gameTime is ever set
  awaySpread?: string; // e.g. "+3.5" — informational only pre-lock, has zero bearing on scoring
  homeSpread?: string;
  result?: {
    winner: string;
    loser: string;
    winnerScore: number;
    loserScore: number;
    resultEnteredAt: Timestamp;
    resultEnteredBy: string; // Commissioner ID
  };
}

/**
 * /leagues/{leagueId}/picks/{pickId}
 * Individual player picks for each game
 * Format: one document per player-per-game for easy querying
 */
export interface PickDoc {
  id: string; // Composite: playerId_gameId
  leagueId: string;
  playerId: string;
  gameId: string;
  week: number;
  pickedTeam: string; // Team abbreviation
  isWildcard: boolean; // True if auto-filled by wildcard picker
  submittedAt: Timestamp;
  isCorrect?: boolean; // Filled after result entered
  pointsAwarded?: number; // Filled after result + scoring
}

/**
 * /leagues/{leagueId}/tiebreakerGuesses/{playerId}_{week}
 * A player's own numeric guess for that week's tiebreaker question — separate
 * from WeeklyTiebreakerDoc, which holds the commissioner's question/rule and
 * (once known) the actual correct answer. Players never see `answer`; the UI
 * only ever shows them the question text and their own guess.
 */
export interface TiebreakerGuessDoc {
  id: string; // `${playerId}_${week}`
  leagueId: string;
  playerId: string;
  week: number;
  guess: number;
  submittedAt: Timestamp;
  // True when this guess was auto-filled at lock time because the player
  // never submitted one — carried forward from their most recent prior
  // week's guess. False/absent for a guess the player actually entered.
  carriedForward?: boolean;
}

export function getTiebreakerGuessId(playerId: string, week: number): string {
  return `${playerId}_${week}`;
}

/**
 * /leagues/{leagueId}/gamePickCounts/{gameId}
 * Aggregate pick counts by team for one game. This is the ONLY way a
 * non-commissioner player ever sees pick distribution — individual pick docs
 * stay private (see firestore.rules), but once a game locks there's no harm
 * in the split being public, and the contrarian format depends on it
 * eventually being visible. Recomputed by the commissioner's actions that
 * lock a game (enterGameResult, setManualLock, lockGame) — see
 * recomputeGamePickCounts() in firebase-utils.ts.
 */
export interface GamePickCountsDoc {
  gameId: string;
  leagueId: string;
  counts: { [team: string]: number };
  updatedAt: Timestamp;
}

/**
 * /leagues/{leagueId}/weeklyTiebreakers/{week}
 * Commissioner-entered tiebreaker for each week
 */
export interface WeeklyTiebreakerDoc {
  leagueId: string;
  week: number;
  question: string; // "Mahomes passing yards", "Total score", etc.
  answer: number | null; // The correct answer — usually not known when the
                          // question is set, only once the relevant game
                          // finishes. Question/rule can be set independently
                          // of this ever being filled in.
  rule: "closest" | "closest_without_going_over";
  locked: boolean; // Once true, no new/changed guesses are accepted — see
                    // lockTiebreaker() in firebase-utils.ts, which also
                    // backfills anyone missing a guess from their last one.
  enteredAt: Timestamp;
  enteredBy: string; // Commissioner ID
}

/**
 * /leagues/{leagueId}/standings/{season}
 * Cached season standings (updated after each week's scoring)
 * Use composite doc for easy updates
 */
export interface StandingsDoc {
  leagueId: string;
  season: number;
  lastUpdatedAt: Timestamp;
  standings: {
    rank: number;
    playerId: string;
    playerName: string;
    totalPoints: number;
    totalCorrect: number;
    highestWeek: number | null;
    secondHighestWeek: number | null;
  }[];
}

/**
 * /leagues/{leagueId}/weeklyScores/{week}
 * Cache of all player scores for a given week
 */
export interface WeeklyScoresDoc {
  leagueId: string;
  week: number;
  scoredAt: Timestamp;
  scores: {
    playerId: string;
    playerName: string;
    gamesCorrect: number;
    pointsRaw: number;
    pointsAfterMultiplier: number;
  }[];
}

// ============================================================================
// FIRESTORE HELPER FUNCTIONS (Query Builders)
// ============================================================================

/**
 * Get all games for a week, in display order.
 * NOTE: ordered by `order`, not `gameTime` — gameTime can be null (TBD) for
 * flex games and late-season weeks, so it can't be the sort key.
 */
export function getGamesForWeekQuery(leagueId: string, week: number) {
  return {
    collection: `leagues/${leagueId}/games`,
    where: [["week", "==", week]],
    orderBy: [["order", "asc"]],
  };
}

/**
 * Get all picks for a player in a week
 */
export function getPlayerWeeklyPicksQuery(
  leagueId: string,
  playerId: string,
  week: number
) {
  return {
    collection: `leagues/${leagueId}/picks`,
    where: [
      ["playerId", "==", playerId],
      ["week", "==", week],
    ],
  };
}

/**
 * Get all picks for a game (to calculate contrarian split)
 */
export function getGamePicksQuery(leagueId: string, gameId: string) {
  return {
    collection: `leagues/${leagueId}/picks`,
    where: [["gameId", "==", gameId]],
  };
}

/**
 * Get all players in league
 */
export function getPlayersQuery(leagueId: string) {
  return {
    collection: `leagues/${leagueId}/players`,
    orderBy: [["name", "asc"]],
  };
}

/**
 * Composite ID for a pick (for easy document naming)
 */
export function getPickId(playerId: string, gameId: string): string {
  return `${playerId}_${gameId}`;
}

/**
 * Reverse: parse playerId and gameId from composite pick ID
 */
export function parsePickId(pickId: string): {
  playerId: string;
  gameId: string;
} {
  const [playerId, gameId] = pickId.split("_");
  return { playerId, gameId };
}

// ============================================================================
// FIRESTORE WRITE OPERATIONS (Batched for transactions)
// ============================================================================

/**
 * Score a single week: calculate points for all picks, update standings
 * This is a complex operation that should be:
 * 1. Fetch all games for week
 * 2. Fetch all picks for week
 * 3. Fetch all results
 * 4. Run scoring engine
 * 5. Batch write: update pick.isCorrect, pick.pointsAwarded, create weeklyScoresDoc
 * 6. Recalculate and update standingsDoc
 *
 * Pseudo-code for transaction:
 */
export interface ScoreWeekOperation {
  leagueId: string;
  week: number;
  commissionerId: string;
}

/**
 * Enter result for a game
 * Updates: game.result, game.isLocked (if final)
 * Triggers scoring recalc for that week
 */
export interface EnterGameResultOperation {
  leagueId: string;
  gameId: string;
  winner: string;
  loser: string;
  winnerScore: number;
  loserScore: number;
  commissionerId: string;
}

/**
 * Submit picks for a player in a week
 * Validates:
 * - All games for week are not yet locked
 * - Player submits one pick per game
 * Writes: creates/updates PickDoc for each game
 */
export interface SubmitPicksOperation {
  leagueId: string;
  playerId: string;
  week: number;
  picks: Array<{
    gameId: string;
    pickedTeam: string;
  }>;
}

/**
 * Wildcard auto-fill: for missed picks, generate random team
 * Writes: creates PickDoc with isWildcard=true
 */
export interface AutofillMissedPicksOperation {
  leagueId: string;
  playerId: string; // Wildcard picker ID
  week: number;
  gamesToFill: string[]; // gameIds without picks
}

// ============================================================================
// TYPES FOR CLIENT-SIDE STATE
// ============================================================================

export interface UILeague {
  id: string;
  name: string;
  season: number;
  playerCount: number;
  commissionerId: string;
  currentWeek: number;
}

export interface UIGame {
  id: string;
  week: number;
  order: number;
  homeTeam: string;
  awayTeam: string;
  gameTime: Date | null;
  timeTBD: boolean;
  isLocked: boolean;
  isManuallyLocked?: boolean;
  playoffMultiplier: number;
  awaySpread?: string;
  homeSpread?: string;
  result?: {
    winner: string;
    loser: string;
    winnerScore: number;
    loserScore: number;
  };
  pickCounts?: {
    [team: string]: number; // Populated once locked, from GamePickCountsDoc — see firestore-schema.ts
  };
}

export interface UIStanding {
  rank: number;
  playerId: string;
  playerName: string;
  totalPoints: number;
  totalCorrect: number;
  highestWeek: number | null;
  secondHighestWeek: number | null;
}

export interface UIPickScreen {
  week: number;
  games: UIGame[];
  playerPicks: {
    [gameId: string]: string; // gameId -> pickedTeam
  };
  isSubmitted: boolean; // True if week is locked or already submitted
}

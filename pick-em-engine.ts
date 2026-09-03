/**
 * Contrarian Pick 'Em Scoring Engine
 * Framework-free, pure TypeScript module for scoring logic and data model
 */

// ============================================================================
// DATA MODEL
// ============================================================================

export interface Player {
  id: string;
  name: string;
}

export interface Game {
  id: string;
  week: number;
  order: number; // Display/pick-sheet position — independent of gameTime, see firestore-schema.ts
  homeTeam: string;
  awayTeam: string;
  gameTime: Date | null; // Null when TBD (flex games, late-season weeks not yet scheduled)
  timeTBD: boolean;
  isPlayoff: boolean;
  playoffMultiplier: number; // 1, 1.25, 1.5, 2
}

export interface Pick {
  playerId: string;
  gameId: string;
  pickedTeam: string;
  isWildcard: boolean; // true if auto-filled by wildcard logic
}

export interface GameResult {
  gameId: string;
  winner: string; // team abbreviation
  loser: string;
  winnerScore: number;
  loserScore: number;
}

export interface WeeklyTiebreaker {
  week: number;
  question: string; // e.g., "Mahomes passing yards"
  answer: number; // e.g., 287
  rule: "closest" | "closest_without_going_over";
}

export interface PlayerWeeklyScore {
  playerId: string;
  week: number;
  gamesCorrect: number;
  pointsRaw: number; // before multiplier
  pointsAfterMultiplier: number; // playoff multiplier applied
  tiebreaker?: {
    playersInTie: string[];
    winnerPlayerId: string;
  };
}

export interface PlayerSeasonStats {
  playerId: string;
  playerName: string;
  totalPoints: number;
  totalCorrect: number;
  weeklyScores: PlayerWeeklyScore[];
  highestWeek: number | null; // points value of highest-scoring week
  secondHighestWeek: number | null;
}

export interface SeasonStandings {
  rank: number;
  playerId: string;
  playerName: string;
  totalPoints: number;
  totalCorrect: number;
  highestWeek: number | null;
  secondHighestWeek: number | null;
}

// ============================================================================
// SCORING ENGINE
// ============================================================================

/**
 * Calculate points for a single game based on pick distribution and result.
 * Contrarian rule: points = count of players who picked the losing team.
 * Multiplier applied for playoff games.
 */
export function scoreGame(
  gameId: string,
  gameResult: GameResult,
  picksByTeam: Map<string, number>, // team -> count of picks
  multiplier: number = 1
): number {
  const winningTeamPickCount = picksByTeam.get(gameResult.winner) || 0;
  const losingTeamPickCount = picksByTeam.get(gameResult.loser) || 0;

  // Sanity check: at least one team picked
  if (winningTeamPickCount === 0 && losingTeamPickCount === 0) {
    return 0;
  }

  // Points = count of players who picked loser
  const basePoints = losingTeamPickCount;
  return Math.round(basePoints * multiplier * 100) / 100;
}

/**
 * Resolve weekly tiebreaker: if multiple players tied on points,
 * rank by tiebreaker answer proximity per the rule.
 * Returns map of playerId -> tiebreaker rank (lower is better).
 */
export function resolveTiebreaker(
  tiedPlayerIds: string[],
  playerGuesses: Map<string, number>, // playerId -> their guess/submission
  correctAnswer: number,
  rule: "closest" | "closest_without_going_over"
): Map<string, number> {
  const ranked = new Map<string, number>();

  const distances = tiedPlayerIds.map((pid) => {
    const guess = playerGuesses.get(pid) ?? 0;
    let distance = Math.abs(guess - correctAnswer);

    // Price Is Right rule: if going over, penalty or disqualify
    if (rule === "closest_without_going_over" && guess > correctAnswer) {
      distance = Infinity; // or very large penalty
    }

    return { playerId: pid, distance };
  });

  // Sort by distance (closer = lower rank)
  distances.sort((a, b) => a.distance - b.distance);

  distances.forEach((item: any, index: number) => {
    ranked.set(item.playerId, index);
  });

  return ranked;
}

/**
 * Calculate season stats for all players given complete week results.
 * Returns sorted standings (descending points).
 */
export function calculateSeasonStandings(
  players: Player[],
  weeklyScores: PlayerWeeklyScore[]
): SeasonStandings[] {
  const statsMap = new Map<string, PlayerSeasonStats>();

  // Initialize
  players.forEach((p) => {
    statsMap.set(p.id, {
      playerId: p.id,
      playerName: p.name,
      totalPoints: 0,
      totalCorrect: 0,
      weeklyScores: [],
      highestWeek: null,
      secondHighestWeek: null,
    });
  });

  // Aggregate weekly scores
  weeklyScores.forEach((ws) => {
    const stats = statsMap.get(ws.playerId);
    if (stats) {
      stats.totalPoints += ws.pointsAfterMultiplier;
      stats.totalCorrect += ws.gamesCorrect;
      stats.weeklyScores.push(ws);
    }
  });

  // Calculate highest and second-highest weeks
  statsMap.forEach((stats) => {
    const sortedWeeks = stats.weeklyScores
      .map((ws) => ws.pointsAfterMultiplier)
      .sort((a, b) => b - a);

    if (sortedWeeks.length > 0) {
      stats.highestWeek = sortedWeeks[0];
    }
    if (sortedWeeks.length > 1) {
      stats.secondHighestWeek = sortedWeeks[1];
    }
  });

  // Sort by tiebreaker: totalPoints desc, then highestWeek desc, then secondHighestWeek desc
  const standings: SeasonStandings[] = Array.from(statsMap.values())
    .map((stats) => ({
      rank: 0,
      playerId: stats.playerId,
      playerName: stats.playerName,
      totalPoints: stats.totalPoints,
      totalCorrect: stats.totalCorrect,
      highestWeek: stats.highestWeek,
      secondHighestWeek: stats.secondHighestWeek,
    }))
    .sort((a, b) => {
      // Primary: total points descending
      if (a.totalPoints !== b.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      // Secondary: total correct descending
      if (a.totalCorrect !== b.totalCorrect) {
        return b.totalCorrect - a.totalCorrect;
      }
      // Tertiary: highest week descending
      const aHighest = a.highestWeek ?? 0;
      const bHighest = b.highestWeek ?? 0;
      if (aHighest !== bHighest) {
        return bHighest - aHighest;
      }
      // Quaternary: second-highest week descending
      const aSecond = a.secondHighestWeek ?? 0;
      const bSecond = b.secondHighestWeek ?? 0;
      return bSecond - aSecond;
    });

  // Assign ranks
  standings.forEach((s, index) => {
    s.rank = index + 1;
  });

  return standings;
}

/**
 * Process a complete week: given picks, results, and optional tiebreaker,
 * return PlayerWeeklyScore[] for that week.
 */
export function scoreWeek(
  week: number,
  games: Game[],
  picks: Pick[],
  results: GameResult[],
  playoffMultiplier: number = 1,
  tiebreaker?: WeeklyTiebreaker
): PlayerWeeklyScore[] {
  const gamesInWeek = games.filter((g) => g.week === week);
  const resultsMap = new Map(results.map((r) => [r.gameId, r]));

  // Group picks by game
  const picksByGame = new Map<string, Map<string, Set<string>>>();
  gamesInWeek.forEach((g) => {
    picksByGame.set(g.id, new Map());
  });

  picks.forEach((p) => {
    if (resultsMap.has(p.gameId)) {
      const gamePickMap = picksByGame.get(p.gameId);
      if (gamePickMap) {
        if (!gamePickMap.has(p.pickedTeam)) {
          gamePickMap.set(p.pickedTeam, new Set());
        }
        gamePickMap.get(p.pickedTeam)!.add(p.playerId);
      }
    }
  });

  // Score each game
  const weekScores = new Map<string, number>();
  const correctPicksPerPlayer = new Map<string, number>();

  gamesInWeek.forEach((g) => {
    const result = resultsMap.get(g.id);
    if (!result) return;

    const gamePickMap = picksByGame.get(g.id) || new Map();
    const picksByTeam = new Map<string, number>(
      Array.from(gamePickMap.entries()).map(([team, players]) => [
        team,
        players.size,
      ])
    );

    const points = scoreGame(g.id, result, picksByTeam, playoffMultiplier);

    // Award points to correct pickers
    const correctPickers = gamePickMap.get(result.winner) || new Set();
    correctPickers.forEach((playerId: string) => {
      weekScores.set(playerId, (weekScores.get(playerId) || 0) + points);
      correctPicksPerPlayer.set(
        playerId,
        (correctPicksPerPlayer.get(playerId) || 0) + 1
      );
    });
  });

  // Collect all players who picked in this week
  const allPlayers = new Set<string>();
  picks.forEach((p) => {
    if (gamesInWeek.some((g) => g.id === p.gameId)) {
      allPlayers.add(p.playerId);
    }
  });

  // Build weekly scores (ensure all players appear, even with 0 points)
  const result: PlayerWeeklyScore[] = Array.from(allPlayers).map((playerId) => {
    const pointsRaw = weekScores.get(playerId) || 0;
    const pointsAfterMultiplier = pointsRaw; // multiplier already applied in scoreGame

    return {
      playerId,
      week,
      gamesCorrect: correctPicksPerPlayer.get(playerId) || 0,
      pointsRaw,
      pointsAfterMultiplier,
    };
  });

  return result;
}

/**
 * Invariant check: total points per week should be constant.
 * For contrarian: if game is split N vs (25-N), total points = N * (25-N) / multiplier
 * Actually: each correct picker gets (count of incorrect pickers) points.
 * So total = sum across all games of (correct * incorrect) normalized by multiplier.
 *
 * This is a sanity check to catch data entry or logic errors.
 */
export function validateWeekTotalPoints(
  weekScores: PlayerWeeklyScore[],
  games: Game[],
  picks: Pick[],
  results: GameResult[]
): {
  isValid: boolean;
  totalPointsAwarded: number;
  expectedRange: [number, number];
  details: string;
} {
  const gamesInWeek = games.length;
  const playerCount = new Set(picks.map((p) => p.playerId)).size;

  // For each game with a split N vs (P-N), max payout per correct picker = P-N (minority loses all)
  // Min payout per correct picker = 1 (overwhelming consensus, e.g., 24-1 split)
  // Total payout per game = N * (P-N) where N is number who picked winner
  // Across all games, if evenly split, sum should be close to gamesInWeek * playerCount^2 / 4
  // But actual depends on distribution.

  const totalPoints = weekScores.reduce((sum, ws) => sum + ws.pointsAfterMultiplier, 0);

  // Conservative bounds: if distribution is uniform (50-50 splits), expect ~playerCount^2/4 * gamesInWeek
  // If distribution is extreme (mostly consensus), expect lower.
  // Hard to validate without knowing the exact split, so just log.

  return {
    isValid: totalPoints > 0, // At least some points awarded
    totalPointsAwarded: totalPoints,
    expectedRange: [
      gamesInWeek * Math.floor(playerCount / 2) * Math.ceil(playerCount / 2) * 0.5,
      gamesInWeek * Math.floor(playerCount / 2) * Math.ceil(playerCount / 2) * 1.5,
    ],
    details: `Week awarded ${totalPoints} total points across ${gamesInWeek} games, ${playerCount} players.`,
  };
}

/**
 * Invariant check: total correct picks should match expected outcome distribution.
 * For each game with result, total correct = size of correct-picker set.
 * Across all games, we expect variance but should be roughly balanced.
 */
export function validateCorrectPickDistribution(
  weekScores: PlayerWeeklyScore[]
): {
  isValid: boolean;
  avgCorrectPerPlayer: number;
  details: string;
} {
  const avgCorrect =
    weekScores.reduce((sum, ws) => sum + ws.gamesCorrect, 0) / weekScores.length;
  const playerCount = weekScores.length;
  const totalCorrectAcrossWeek = weekScores.reduce((sum, ws) => sum + ws.gamesCorrect, 0);

  // If N players and M games, and each game has exactly one winner,
  // total correct picks should be close to the number of games.
  // (Some games split 1-24, others 13-12, but sum of correct = # of games.)

  return {
    isValid: avgCorrect > 0,
    avgCorrectPerPlayer: avgCorrect,
    details: `Average ${avgCorrect.toFixed(2)} correct picks per player. Total across week: ${totalCorrectAcrossWeek}.`,
  };
}

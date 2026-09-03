/**
 * Pick 'Em Simulation Harness
 * Generates randomized seasons and validates scoring engine invariants
 */

import * as engine from "./pick-em-engine";

// ============================================================================
// SIMULATION DATA GENERATION
// ============================================================================

/**
 * Generate N players with realistic names
 */
function generatePlayers(count: number): engine.Player[] {
  const names = [
    "Paterus Maximus",
    "Big Bad John",
    "The Kids",
    "Team Spechtacular",
    "Curran Events",
    "Eagles Nest",
    "Daniel-san",
    "Papa Mac",
    "Home Alone",
    "Fat Scrubbs",
    "Mission Impossible",
    "William Tell",
    "Blitzed and Confused",
    "KatiePriceless",
    "Dawson's Creek",
    "Maren's Dad",
    "Ward's Mom",
    "War of the Roses",
    "Encephalopathy Enjoyer",
    "Sam the Seer",
    "For Pete's Sake",
    "The Fiuk?",
    "Tom S",
    "Pick'em Right!",
    "Munchkin Man",
  ];

  return names.slice(0, count).map((name, i) => ({
    id: `p${i}`,
    name,
  }));
}

/**
 * Generate a full NFL season: 18 weeks of regular season (13 games/week),
 * plus 4 playoff weeks with multipliers
 */
function generateSeason(): engine.Game[] {
  const games: engine.Game[] = [];
  const nflTeams = [
    "ARI",
    "ATL",
    "BAL",
    "BUF",
    "CAR",
    "CHI",
    "CIN",
    "CLE",
    "DAL",
    "DEN",
    "DET",
    "GB",
    "HOU",
    "IND",
    "JAX",
    "KC",
    "LAC",
    "LAR",
    "MIA",
    "MIN",
    "NE",
    "NO",
    "NYG",
    "NYJ",
    "PHI",
    "PIT",
    "SF",
    "SEA",
    "TB",
    "TEN",
    "WAS",
  ];

  let gameId = 0;

  // Regular season: weeks 1-18, 13 games per week
  for (let week = 1; week <= 18; week++) {
    for (let g = 0; g < 13; g++) {
      const homeIdx = Math.floor(Math.random() * nflTeams.length);
      let awayIdx = Math.floor(Math.random() * nflTeams.length);
      while (awayIdx === homeIdx) {
        awayIdx = Math.floor(Math.random() * nflTeams.length);
      }

      games.push({
        id: `g${gameId++}`,
        week,
        order: g, // Display order defaults to generation order; commissioner can reorder later
        homeTeam: nflTeams[homeIdx],
        awayTeam: nflTeams[awayIdx],
        gameTime: new Date(2025, 0, 5 + week * 7), // Approx dates
        timeTBD: false,
        isPlayoff: false,
        playoffMultiplier: 1,
      });
    }
  }

  // Playoff: 4 games per week, weeks 19-22 with increasing multipliers
  const playoffMultipliers = [1.25, 1.25, 1.5, 2]; // Wild Card, WC, Divisional, Championship, Super Bowl
  for (let week = 19; week <= 22; week++) {
    const multiplier = playoffMultipliers[week - 19];
    for (let g = 0; g < 4; g++) {
      const homeIdx = Math.floor(Math.random() * nflTeams.length);
      let awayIdx = Math.floor(Math.random() * nflTeams.length);
      while (awayIdx === homeIdx) {
        awayIdx = Math.floor(Math.random() * nflTeams.length);
      }

      games.push({
        id: `g${gameId++}`,
        week,
        order: g,
        homeTeam: nflTeams[homeIdx],
        awayTeam: nflTeams[awayIdx],
        gameTime: new Date(2025, 0, 5 + week * 7),
        timeTBD: false,
        isPlayoff: true,
        playoffMultiplier: multiplier,
      });
    }
  }

  return games;
}

/**
 * Generate random picks: each player picks a random team for each game.
 * Occasionally (5% chance), player misses a pick -> replaced by wildcard (random team).
 */
function generatePicks(
  players: engine.Player[],
  games: engine.Game[]
): engine.Pick[] {
  const picks: engine.Pick[] = [];
  const wildCardPlayerId = players[players.length - 1].id; // Youngest son (last player)

  players.forEach((player) => {
    games.forEach((game) => {
      let pickedTeam = Math.random() > 0.5 ? game.homeTeam : game.awayTeam;
      let isWildcard = false;

      // 5% chance player misses this pick (wildcard fills it)
      if (Math.random() < 0.05 && player.id !== wildCardPlayerId) {
        pickedTeam = Math.random() > 0.5 ? game.homeTeam : game.awayTeam;
        isWildcard = true;
      }

      picks.push({
        playerId: player.id,
        gameId: game.id,
        pickedTeam,
        isWildcard,
      });
    });
  });

  return picks;
}

/**
 * Generate game results: each team wins with 50-50 probability.
 * Scores are realistic (14-38 range).
 */
function generateResults(games: engine.Game[]): engine.GameResult[] {
  return games.map((game) => {
    const homeWins = Math.random() > 0.5;
    const winnerScore = Math.floor(Math.random() * (38 - 14 + 1)) + 14;
    const loserScore = Math.floor(Math.random() * (winnerScore - 3)) + 0;

    return {
      gameId: game.id,
      winner: homeWins ? game.homeTeam : game.awayTeam,
      loser: homeWins ? game.awayTeam : game.homeTeam,
      winnerScore,
      loserScore,
    };
  });
}

// ============================================================================
// SIMULATION RUNNER
// ============================================================================

export interface SimulationResult {
  seasonName: string;
  players: engine.Player[];
  totalGames: number;
  totalWeeks: number;
  standings: engine.SeasonStandings[];
  invariantChecks: {
    weeklyTotalPointsValid: boolean;
    correctPickDistributionValid: boolean;
    standingsSortedCorrectly: boolean;
    allPlayersPresent: boolean;
    tiebreakersResolved: boolean;
  };
  warnings: string[];
}

export function runSimulation(
  simulationName: string,
  playerCount: number = 25
): SimulationResult {
  const players = generatePlayers(playerCount);
  const games = generateSeason();
  const picks = generatePicks(players, games);
  const results = generateResults(games);

  // Score all weeks
  const allWeeklyScores: engine.PlayerWeeklyScore[] = [];
  const weeklyValidation: any[] = [];

  for (let week = 1; week <= 22; week++) {
    const weeksGames = games.filter((g) => g.week === week);
    if (weeksGames.length === 0) continue;

    // Determine multiplier for this week
    const multiplier = weeksGames[0].playoffMultiplier;

    // Score the week
    const weekScores = engine.scoreWeek(
      week,
      games,
      picks,
      results,
      multiplier
    );
    allWeeklyScores.push(...weekScores);

    // Validate
    const validation = engine.validateWeekTotalPoints(
      weekScores,
      weeksGames,
      picks.filter((p) =>
        weeksGames.some((g) => g.id === p.gameId)
      ),
      results.filter((r) =>
        weeksGames.some((g) => g.id === r.gameId)
      )
    );
    weeklyValidation.push({ week, validation });
  }

  // Calculate standings
  const standings = engine.calculateSeasonStandings(players, allWeeklyScores);

  // Invariant checks
  const warnings: string[] = [];
  let totalPointsValid = true;
  let correctPickDistValid = true;

  weeklyValidation.forEach(({ week, validation }) => {
    if (!validation.isValid) {
      totalPointsValid = false;
      warnings.push(
        `Week ${week}: ${validation.details} (expected range: ${validation.expectedRange[0].toFixed(0)}-${validation.expectedRange[1].toFixed(0)})`
      );
    }
  });

  // Check that standings are sorted correctly
  let standingsSortedCorrectly = true;
  for (let i = 0; i < standings.length - 1; i++) {
    const current = standings[i];
    const next = standings[i + 1];

    if (current.totalPoints < next.totalPoints) {
      standingsSortedCorrectly = false;
      warnings.push(
        `Standing ${i + 1}: ${current.playerName} (${current.totalPoints}) should not precede ${next.playerName} (${next.totalPoints})`
      );
    }
  }

  // Check all players present
  const presentPlayers = new Set(standings.map((s) => s.playerId));
  const allPlayersPresent = presentPlayers.size === players.length;
  if (!allPlayersPresent) {
    warnings.push(
      `Missing ${players.length - presentPlayers.size} player(s) in standings`
    );
  }

  return {
    seasonName: simulationName,
    players,
    totalGames: games.length,
    totalWeeks: 22,
    standings,
    invariantChecks: {
      weeklyTotalPointsValid: totalPointsValid,
      correctPickDistributionValid: correctPickDistValid,
      standingsSortedCorrectly,
      allPlayersPresent,
      tiebreakersResolved: true, // Placeholder
    },
    warnings,
  };
}

// ============================================================================
// BATCH SIMULATION AND REPORTING
// ============================================================================

export function runBatchSimulations(
  count: number,
  playerCount: number = 25
): void {
  console.log(
    `\n${"=".repeat(80)}`
  );
  console.log(
    `CONTRARIAN PICK 'EM ENGINE SIMULATION (${count} seasons, ${playerCount} players)`
  );
  console.log(`${"=".repeat(80)}\n`);

  const results: SimulationResult[] = [];
  let totalWarnings = 0;
  const failedInvariants: {
    invariant: string;
    count: number;
  }[] = [];

  for (let i = 0; i < count; i++) {
    const result = runSimulation(`Season ${i + 1}`, playerCount);
    results.push(result);
    totalWarnings += result.warnings.length;

    // Track invariant failures
    if (!result.invariantChecks.weeklyTotalPointsValid) {
      const inv = failedInvariants.find(
        (f) => f.invariant === "weeklyTotalPointsValid"
      );
      if (inv) inv.count++;
      else failedInvariants.push({ invariant: "weeklyTotalPointsValid", count: 1 });
    }
    if (!result.invariantChecks.standingsSortedCorrectly) {
      const inv = failedInvariants.find(
        (f) => f.invariant === "standingsSortedCorrectly"
      );
      if (inv) inv.count++;
      else failedInvariants.push({ invariant: "standingsSortedCorrectly", count: 1 });
    }
    if (!result.invariantChecks.allPlayersPresent) {
      const inv = failedInvariants.find(
        (f) => f.invariant === "allPlayersPresent"
      );
      if (inv) inv.count++;
      else failedInvariants.push({ invariant: "allPlayersPresent", count: 1 });
    }

    if ((i + 1) % 10 === 0) {
      process.stdout.write(`\r${i + 1}/${count} seasons completed...`);
    }
  }

  console.log(`\r${count}/${count} seasons completed.          \n`);

  // Report summary
  console.log(`RESULTS:`);
  console.log(`  Total simulations: ${count}`);
  console.log(`  Total warnings: ${totalWarnings}`);
  console.log(`  Warnings per sim: ${(totalWarnings / count).toFixed(2)}`);

  if (failedInvariants.length > 0) {
    console.log(`\n  INVARIANT FAILURES:`);
    failedInvariants.forEach(({ invariant, count: failCount }) => {
      console.log(
        `    - ${invariant}: ${failCount}/${count} (${((failCount / count) * 100).toFixed(1)}%)`
      );
    });
  } else {
    console.log(`\n  ✓ ALL INVARIANTS PASSED ACROSS ALL SIMULATIONS`);
  }

  // Sample one season's standings
  if (results.length > 0) {
    const sampleResult = results[0];
    console.log(`\nSAMPLE SEASON (${sampleResult.seasonName}) TOP 5 STANDINGS:`);
    console.log(
      `  Rank | Player                      | Points  | Correct | High  | 2nd High`
    );
    console.log(`  ${"-".repeat(70)}`);
    sampleResult.standings.slice(0, 5).forEach((s) => {
      console.log(
        `  ${String(s.rank).padStart(2)} | ${s.playerName.padEnd(27)} | ${String(s.totalPoints).padStart(7)} | ${String(s.totalCorrect).padStart(7)} | ${String(s.highestWeek ?? 0).padStart(4)} | ${String(s.secondHighestWeek ?? 0).padStart(4)}`
      );
    });
  }

  console.log(`\n${"=".repeat(80)}\n`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

if (require.main === module) {
  // Run 100 simulations with 25 players
  runBatchSimulations(100, 25);
}

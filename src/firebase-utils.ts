/**
 * Firebase initialization and Firestore helper functions
 */

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  setDoc,
  updateDoc,
  writeBatch,
  Timestamp,
  Query,
} from "firebase/firestore";
import * as engine from "../pick-em-engine";
import * as schema from "./firestore-schema";

// Initialize Firebase (replace with your config)
const firebaseConfig = {
  apiKey: import.meta.env.REACT_APP_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.REACT_APP_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.REACT_APP_FIREBASE_APP_ID || "",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ============================================================================
// FETCH OPERATIONS
// ============================================================================

/**
 * Get league metadata
 */
export async function getLeague(
  leagueId: string
): Promise<schema.LeagueDoc | null> {
  const docRef = doc(db, "leagues", leagueId);
  const docSnap = await getDoc(docRef);
  return (docSnap.exists() ? docSnap.data() : null) as schema.LeagueDoc | null;
}

/**
 * Get all players in league
 */
export async function getPlayers(leagueId: string): Promise<schema.PlayerDoc[]> {
  const q = query(collection(db, `leagues/${leagueId}/players`), orderBy("name"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => doc.data() as schema.PlayerDoc);
}

/**
 * Get all games for a week, in display order.
 * Ordered by `order`, not `gameTime` — gameTime is nullable (TBD) for flex
 * games and late-season weeks, so it can't be the sort key.
 */
export async function getGamesForWeek(
  leagueId: string,
  week: number
): Promise<schema.GameDoc[]> {
  const q = query(
    collection(db, `leagues/${leagueId}/games`),
    where("week", "==", week),
    orderBy("order")
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => doc.data() as schema.GameDoc);
}

/**
 * Get all picks for a player in a week
 */
export async function getPlayerWeeklyPicks(
  leagueId: string,
  playerId: string,
  week: number
): Promise<schema.PickDoc[]> {
  const q = query(
    collection(db, `leagues/${leagueId}/picks`),
    where("playerId", "==", playerId),
    where("week", "==", week)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => doc.data() as schema.PickDoc);
}

/**
 * Every pick a player has ever made, across every week — no week filter.
 * Safely covered by the SAME security rule as getPlayerWeeklyPicks (the
 * query filters on playerId==self, matching the rule's own
 * resource.data.playerId check) — nothing new needed there. Used by the
 * season-wide "My Summary" grid.
 */
export async function getPlayerAllPicks(leagueId: string, playerId: string): Promise<schema.PickDoc[]> {
  const q = query(collection(db, `leagues/${leagueId}/picks`), where("playerId", "==", playerId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => doc.data() as schema.PickDoc);
}

/**
 * Every game across every week — no week filter. The games collection has
 * always been openly readable by any signed-in user, so this needs no rule
 * changes either. Used to build the season-wide "My Summary" grid's column
 * headers and per-week game ordering.
 */
export async function getAllGamesForLeague(leagueId: string): Promise<schema.GameDoc[]> {
  const q = query(collection(db, `leagues/${leagueId}/games`), orderBy("week"), orderBy("order"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => doc.data() as schema.GameDoc);
}

/**
 * Every pick the security rules will show the CALLING user, across every
 * week — no week filter. For the commissioner this is genuinely
 * everything; for a regular player it's their own picks plus whatever the
 * "own picks + locked commissioner week + any locked game" rule already
 * allows (same rule Weekly Summary depends on, just not scoped to one
 * week). Used to build the league-wide Standings grid.
 */
export async function getAllPicksForLeague(leagueId: string): Promise<schema.PickDoc[]> {
  const q = query(collection(db, `leagues/${leagueId}/picks`));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => doc.data() as schema.PickDoc);
}

/**
 * Get all picks for a game
 */
export async function getGamePicks(
  leagueId: string,
  gameId: string
): Promise<schema.PickDoc[]> {
  const q = query(
    collection(db, `leagues/${leagueId}/picks`),
    where("gameId", "==", gameId)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => doc.data() as schema.PickDoc);
}

/**
 * Get current season standings
 */
export async function getStandings(
  leagueId: string,
  season: number
): Promise<schema.UIStanding[]> {
  const docRef = doc(db, `leagues/${leagueId}/standings/${season}`);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return [];
  const data = docSnap.data() as schema.StandingsDoc;
  return data.standings;
}

/**
 * Get scores for a specific week
 */
export async function getWeeklyScores(
  leagueId: string,
  week: number
): Promise<any[]> {
  const docRef = doc(db, `leagues/${leagueId}/weeklyScores/${week}`);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return [];
  const data = docSnap.data() as schema.WeeklyScoresDoc;
  return data.scores;
}

/**
 * Get weekly tiebreaker
 */
export async function getWeeklyTiebreaker(
  leagueId: string,
  week: number
): Promise<schema.WeeklyTiebreakerDoc | null> {
  const docRef = doc(db, `leagues/${leagueId}/weeklyTiebreakers/${week}`);
  const docSnap = await getDoc(docRef);
  return (docSnap.exists() ? docSnap.data() : null) as
    | schema.WeeklyTiebreakerDoc
    | null;
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Submit picks for a player in a week
 * Batch write: creates/updates PickDoc for each game
 */
export async function submitPicks(
  leagueId: string,
  playerId: string,
  week: number,
  picks: Array<{ gameId: string; pickedTeam: string }>
): Promise<void> {
  const batch = writeBatch(db);

  picks.forEach(({ gameId, pickedTeam }) => {
    const pickId = schema.getPickId(playerId, gameId);
    const pickRef = doc(db, `leagues/${leagueId}/picks`, pickId);
    batch.set(
      pickRef,
      {
        id: pickId,
        leagueId,
        playerId,
        gameId,
        week,
        pickedTeam,
        isWildcard: false,
        submittedAt: Timestamp.now(),
        visibleToAll: false,
      } as schema.PickDoc,
      { merge: true }
    );
  });

  await batch.commit();
}

/**
 * Wildcard auto-fill missed picks
 */
export async function autofillMissedPicks(
  leagueId: string,
  wildcardPickerId: string,
  week: number,
  gamesToFill: string[]
): Promise<void> {
  const batch = writeBatch(db);

  gamesToFill.forEach((gameId) => {
    // Random team pick (50-50 home/away)
    const teams = ["HOME", "AWAY"]; // Will be replaced with actual team during write
    const pickedTeamIsHome = Math.random() > 0.5;

    const pickId = schema.getPickId(wildcardPickerId, gameId);
    const pickRef = doc(db, `leagues/${leagueId}/picks`, pickId);

    // Note: In real implementation, fetch the game to get actual team names
    batch.set(
      pickRef,
      {
        id: pickId,
        leagueId,
        playerId: wildcardPickerId,
        gameId,
        week,
        pickedTeam: pickedTeamIsHome ? "HOME" : "AWAY", // Placeholder
        isWildcard: true,
        submittedAt: Timestamp.now(),
      } as schema.PickDoc,
      { merge: true }
    );
  });

  await batch.commit();
}

/**
 * Recompute and store the public pick-count split for one game. Reads every
 * pick for that game (commissioner-only under the security rules — this
 * function only ever runs as a commissioner action) and writes the tally to
 * gamePickCounts, which everyone can read. Call this any time a game's lock
 * state changes to true.
 */
export async function recomputeGamePickCounts(leagueId: string, gameId: string): Promise<void> {
  const picks = await getGamePicks(leagueId, gameId);
  const counts: { [team: string]: number } = {};
  picks.forEach((p) => {
    counts[p.pickedTeam] = (counts[p.pickedTeam] || 0) + 1;
  });

  const countsRef = doc(db, `leagues/${leagueId}/gamePickCounts`, gameId);
  await setDoc(countsRef, {
    gameId,
    leagueId,
    counts,
    updatedAt: Timestamp.now(),
  } as schema.GamePickCountsDoc);
}

/**
 * Marks every pick for one game as visible to everyone — call this
 * whenever a game's isLocked flips to true (every call site that does that
 * should call this right alongside it). This denormalized write is what
 * the picks read rule actually checks now (resource.data.visibleToAll ==
 * true), replacing an earlier version that tried to compute this at read
 * time with get() calls — that approach repeatedly failed for regular
 * (non-commissioner) accounts on broad list queries in real testing.
 */
export async function markPicksVisibleForGame(leagueId: string, gameId: string): Promise<void> {
  const picks = await getGamePicks(leagueId, gameId);
  if (picks.length === 0) return;
  const batch = writeBatch(db);
  picks.forEach((p) => {
    const pickRef = doc(db, `leagues/${leagueId}/picks`, p.id);
    batch.update(pickRef, { visibleToAll: true });
  });
  await batch.commit();
}

/**
 * Marks/unmarks the commissioner's own picks for one week as visible —
 * call this from setPlayerWeekLock's commissioner branch. Locking always
 * makes all of that week's commissioner picks visible. Unlocking only
 * hides picks for games that haven't independently locked yet — once a
 * GAME locks, that pick stays visible regardless of this toggle (matches
 * the existing "anyone's picks for a locked game are public" rule, which
 * this doesn't override).
 */
export async function updateCommissionerPicksVisibility(
  leagueId: string,
  commissionerId: string,
  week: number,
  locked: boolean
): Promise<void> {
  const picks = await getPlayerWeeklyPicks(leagueId, commissionerId, week);
  if (picks.length === 0) return;

  const batch = writeBatch(db);
  if (locked) {
    picks.forEach((p) => {
      const pickRef = doc(db, `leagues/${leagueId}/picks`, p.id);
      batch.update(pickRef, { visibleToAll: true });
    });
  } else {
    const gameIds = Array.from(new Set(picks.map((p) => p.gameId)));
    const gameDocs = await Promise.all(
      gameIds.map((gid) => getDoc(doc(db, `leagues/${leagueId}/games`, gid)))
    );
    const lockedGameIds = new Set(
      gameDocs.filter((d) => d.exists() && (d.data() as schema.GameDoc).isLocked).map((d) => d.id)
    );
    picks.forEach((p) => {
      if (lockedGameIds.has(p.gameId)) return; // stays visible — the game itself locked
      const pickRef = doc(db, `leagues/${leagueId}/picks`, p.id);
      batch.update(pickRef, { visibleToAll: false });
    });
  }
  await batch.commit();
}

/**
 * Get the public pick-count splits for every game in a week, keyed by gameId.
 * Only returns data for games that have been locked at least once (no doc
 * exists yet for a game that's never locked) — used by LeagueContext to
 * merge counts into UIGame for the picks screen and weekly summary.
 */
export async function getGamePickCountsForWeek(
  leagueId: string,
  gameIds: string[]
): Promise<{ [gameId: string]: { [team: string]: number } }> {
  const result: { [gameId: string]: { [team: string]: number } } = {};
  await Promise.all(
    gameIds.map(async (gameId) => {
      const countsRef = doc(db, `leagues/${leagueId}/gamePickCounts`, gameId);
      const snap = await getDoc(countsRef);
      if (snap.exists()) {
        result[gameId] = (snap.data() as schema.GamePickCountsDoc).counts;
      }
    })
  );
  return result;
}

/**
 * Get every pick for a week, across all players. Commissioner-only under the
 * security rules (a regular player's copy of this query only ever returns
 * their own docs, since the rule is evaluated per-document). Used by the
 * commissioner hub's per-game "who's missing" view and by WeeklySummary.
 */
/**
 * Used by commissioner-only screens. Deliberately unfiltered beyond week —
 * safe there because the commissioner's access comes from isCommissioner(),
 * a rule branch that doesn't depend on resource.data at all, so it's
 * provable for any query shape. NOT safe for a regular player — see
 * getVisiblePicksForWeek below for why, and use that instead for any
 * player-facing screen.
 */
export async function getAllPicksForWeek(leagueId: string, week: number): Promise<schema.PickDoc[]> {
  const q = query(collection(db, `leagues/${leagueId}/picks`), where("week", "==", week));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((d) => d.data() as schema.PickDoc);
}

/**
 * The actual reliable way for a REGULAR player to fetch "picks I'm allowed
 * to see" for a week. Runs two separately-filtered queries instead of one
 * broad one, because that's what real testing has shown Firestore actually
 * requires: a list query is only provably safe when the query's own WHERE
 * filter matches, field-for-field, the exact condition the security rule
 * checks — not just "the rule checks some resource.data field." Every
 * earlier version of this (broad query + a rule condition the query never
 * filtered on, even a simple one like visibleToAll==true) failed with
 * permission-denied for non-commissioner accounts despite being logically
 * correct on paper. These two queries each mirror their rule branch
 * exactly: playerId==me matches "see your own picks," visibleToAll==true
 * matches the reveal-once-locked branch.
 */
export async function getVisiblePicksForWeek(
  leagueId: string,
  week: number,
  myPlayerId: string
): Promise<schema.PickDoc[]> {
  const [ownSnap, visibleSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, `leagues/${leagueId}/picks`),
        where("week", "==", week),
        where("playerId", "==", myPlayerId)
      )
    ),
    getDocs(
      query(
        collection(db, `leagues/${leagueId}/picks`),
        where("week", "==", week),
        where("visibleToAll", "==", true)
      )
    ),
  ]);

  const byId = new Map<string, schema.PickDoc>();
  ownSnap.docs.forEach((d) => byId.set(d.id, d.data() as schema.PickDoc));
  visibleSnap.docs.forEach((d) => byId.set(d.id, d.data() as schema.PickDoc));
  return Array.from(byId.values());
}

/**
 * Enter game result and trigger week scoring
 */
/**
 * Score ONE game immediately after its result is entered — and update
 * season standings right away. The contrarian scoring math (engine.scoreGame)
 * only ever depends on that one game's own pick split; it never needed to
 * wait for the rest of the week. Batching scoring into a manual "Score Week"
 * step was a workflow choice, not a mathematical requirement — this removes
 * that step so standings reflect a finished game within seconds, not
 * whenever someone remembers to click a button.
 */
/**
 * Recompute the public weekly-scores cache for one week, from every pick
 * that's been scored so far that week. Used both by scoreGameImmediately
 * (keeps it live as results come in) and available standalone if it ever
 * needs a manual refresh. This is what "who's leading this week" and "my
 * points so far" read from — a player's own picks already tell them their
 * own total, but seeing where they rank against everyone else needs this
 * public aggregate, the same way the season standings doc works.
 */
export async function recalculateWeeklyScores(leagueId: string, week: number): Promise<void> {
  const [players, weekPicks] = await Promise.all([
    getPlayers(leagueId),
    getAllPicksForWeek(leagueId, week),
  ]);

  const scores = players.map((player) => {
    const theirPicks = weekPicks.filter(
      (p) => p.playerId === player.id && p.pointsAwarded !== undefined
    );
    const pointsAfterMultiplier = theirPicks.reduce((sum, p) => sum + (p.pointsAwarded || 0), 0);
    const gamesCorrect = theirPicks.filter((p) => p.isCorrect).length;
    return {
      playerId: player.id,
      playerName: player.name,
      gamesCorrect,
      pointsRaw: pointsAfterMultiplier,
      pointsAfterMultiplier,
    };
  });

  const scoresRef = doc(db, `leagues/${leagueId}/weeklyScores/${week}`);
  await setDoc(scoresRef, {
    leagueId,
    week,
    scoredAt: Timestamp.now(),
    scores,
  } as schema.WeeklyScoresDoc);
}

export async function scoreGameImmediately(
  leagueId: string,
  gameId: string,
  week: number,
  winner: string,
  loser: string,
  playoffMultiplier: number
): Promise<void> {
  const picks = await getGamePicks(leagueId, gameId);

  const picksByTeam = new Map<string, number>();
  picks.forEach((p) => {
    picksByTeam.set(p.pickedTeam, (picksByTeam.get(p.pickedTeam) || 0) + 1);
  });

  const points = engine.scoreGame(
    gameId,
    { gameId, winner, loser, winnerScore: 0, loserScore: 0 },
    picksByTeam,
    playoffMultiplier
  );

  const batch = writeBatch(db);
  picks.forEach((pick) => {
    const isCorrect = pick.pickedTeam === winner;
    const pickRef = doc(db, `leagues/${leagueId}/picks`, pick.id);
    batch.update(pickRef, {
      isCorrect,
      pointsAwarded: isCorrect ? points : 0,
    });
  });
  await batch.commit();

  await recalculateWeeklyScores(leagueId, week);
  await recalculateSeasonStandings(leagueId);
}

export async function enterGameResult(
  leagueId: string,
  gameId: string,
  week: number,
  winner: string,
  loser: string,
  winnerScore: number,
  loserScore: number,
  commissionerId: string,
  playoffMultiplier: number = 1
): Promise<void> {
  const gameRef = doc(db, `leagues/${leagueId}/games`, gameId);
  await updateDoc(gameRef, {
    "result.winner": winner,
    "result.loser": loser,
    "result.winnerScore": winnerScore,
    "result.loserScore": loserScore,
    "result.resultEnteredAt": Timestamp.now(),
    "result.resultEnteredBy": commissionerId,
    isLocked: true,
  });
  // A result implies the game is over, so this is also a safe point to
  // capture the final pick split for the picks screen / weekly summary.
  await recomputeGamePickCounts(leagueId, gameId);
  await markPicksVisibleForGame(leagueId, gameId);
  // Score this game and refresh standings immediately — see
  // scoreGameImmediately() for why this no longer waits for a manual
  // "Score Week" action.
  await scoreGameImmediately(leagueId, gameId, week, winner, loser, playoffMultiplier);
}

/**
 * Score an entire week and update standings
 * This is the main scoring operation
 */
export async function scoreWeek(
  leagueId: string,
  week: number,
  commissionerId: string
): Promise<void> {
  // Fetch all data for the week
  const games = await getGamesForWeek(leagueId, week);
  const players = await getPlayers(leagueId);
  const allPicksForWeek: schema.PickDoc[] = [];

  // Fetch all picks for all players in this week
  for (const player of players) {
    const picks = await getPlayerWeeklyPicks(leagueId, player.id, week);
    allPicksForWeek.push(...picks);
  }

  // Convert to engine format
  const enginePlayers: engine.Player[] = players.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  const engineGames: engine.Game[] = games.map((g) => ({
    id: g.id,
    week: g.week,
    order: g.order,
    homeTeam: g.homeTeam,
    awayTeam: g.awayTeam,
    gameTime: g.gameTime ? g.gameTime.toDate() : null,
    timeTBD: g.timeTBD,
    isPlayoff: g.isPlayoff,
    playoffMultiplier: g.playoffMultiplier,
  }));

  const enginePicks: engine.Pick[] = allPicksForWeek.map((p) => ({
    playerId: p.playerId,
    gameId: p.gameId,
    pickedTeam: p.pickedTeam,
    isWildcard: p.isWildcard,
  }));

  const engineResults: engine.GameResult[] = games
    .filter((g) => g.result)
    .map((g) => ({
      gameId: g.id,
      winner: g.result!.winner,
      loser: g.result!.loser,
      winnerScore: g.result!.winnerScore,
      loserScore: g.result!.loserScore,
    }));

  // Score the week using engine — this gives us the season-tracking aggregate
  // (gamesCorrect, pointsAfterMultiplier per player) used for standings.
  const weeklyScores = engine.scoreWeek(
    week,
    engineGames,
    enginePicks,
    engineResults,
    games[0]?.playoffMultiplier || 1
  );

  // Per-PICK isCorrect/pointsAwarded needs each pick checked against its own
  // game's result — NOT derived from the weekly aggregate above. (A prior
  // version of this function used `ws.gamesCorrect > 0`, which marked every
  // pick a player made that week as correct if they got even one game right.)
  const picksByGame = new Map<string, Map<string, number>>();
  allPicksForWeek.forEach((p) => {
    if (!picksByGame.has(p.gameId)) picksByGame.set(p.gameId, new Map());
    const teamMap = picksByGame.get(p.gameId)!;
    teamMap.set(p.pickedTeam, (teamMap.get(p.pickedTeam) || 0) + 1);
  });

  const pointsPerCorrectPickByGame = new Map<string, number>();
  engineGames.forEach((g) => {
    const result = engineResults.find((r) => r.gameId === g.id);
    if (!result) return; // not final yet — picks for this game stay unscored
    const picksByTeam = picksByGame.get(g.id) || new Map();
    const points = engine.scoreGame(g.id, result, picksByTeam, g.playoffMultiplier);
    pointsPerCorrectPickByGame.set(g.id, points);
  });

  // Batch write: update picks with results and write weekly scores cache
  const batch = writeBatch(db);

  // Update picks — one write per pick, scored against that pick's own game.
  allPicksForWeek.forEach((pick) => {
    const game = games.find((g) => g.id === pick.gameId);
    if (!game || !game.result) return; // game not final yet, leave unscored
    const isCorrect = pick.pickedTeam === game.result.winner;
    const pointsAwarded = isCorrect ? pointsPerCorrectPickByGame.get(pick.gameId) || 0 : 0;
    const pickRef = doc(db, `leagues/${leagueId}/picks`, pick.id);
    batch.update(pickRef, { isCorrect, pointsAwarded });
  });

  // Write weekly scores cache — attach playerName since the engine's
  // PlayerWeeklyScore doesn't carry it, and WeeklyScoresDoc requires it.
  const scoresWithNames = weeklyScores.map((ws) => {
    const player = players.find((p) => p.id === ws.playerId);
    return {
      playerId: ws.playerId,
      playerName: player?.name || ws.playerId,
      gamesCorrect: ws.gamesCorrect,
      pointsRaw: ws.pointsRaw,
      pointsAfterMultiplier: ws.pointsAfterMultiplier,
    };
  });

  const scoresRef = doc(db, `leagues/${leagueId}/weeklyScores/${week}`);
  batch.set(scoresRef, {
    leagueId,
    week,
    scoredAt: Timestamp.now(),
    scores: scoresWithNames,
  } as schema.WeeklyScoresDoc);

  await batch.commit();

  // Recalculate season standings
  await recalculateSeasonStandings(leagueId);
}

/**
 * Recalculate and update season standings (call after scoring a week)
 */
export async function recalculateSeasonStandings(leagueId: string): Promise<void> {
  // Fetch all weekly scores across all weeks
  const league = await getLeague(leagueId);
  if (!league) return;

  const players = await getPlayers(leagueId);
  const season = league.season;

  // Fetch all picks for all players (to get their scores)
  const allPicks: schema.PickDoc[] = [];
  for (const player of players) {
    const q = query(
      collection(db, `leagues/${leagueId}/picks`),
      where("playerId", "==", player.id)
    );
    const querySnapshot = await getDocs(q);
    allPicks.push(...querySnapshot.docs.map((doc) => doc.data() as schema.PickDoc));
  }

  // Aggregate per player
  const playerStats = new Map<
    string,
    {
      totalPoints: number;
      totalCorrect: number;
      weeklyPoints: number[];
    }
  >();

  players.forEach((p) => {
    playerStats.set(p.id, {
      totalPoints: 0,
      totalCorrect: 0,
      weeklyPoints: [],
    });
  });

  allPicks.forEach((pick) => {
    // Week 0 was the test slate — real money and real standings shouldn't
    // include it. Its data stays in Firestore (nothing here deletes
    // anything), it's just excluded from the real season's totals.
    if (pick.week === 0) return;
    const stats = playerStats.get(pick.playerId);
    if (stats && pick.pointsAwarded !== undefined) {
      stats.totalPoints += pick.pointsAwarded;
      if (pick.isCorrect) stats.totalCorrect += 1;
    }
  });

  // Calculate highest and second-highest weeks
  const standings: schema.UIStanding[] = players.map((p) => {
    const stats = playerStats.get(p.id) || {
      totalPoints: 0,
      totalCorrect: 0,
      weeklyPoints: [],
    };

    const sortedWeeks = (stats.weeklyPoints || []).sort((a, b) => b - a);
    const highestWeek = sortedWeeks[0] || null;
    const secondHighestWeek = sortedWeeks[1] || null;

    return {
      rank: 0,
      playerId: p.id,
      playerName: p.name,
      totalPoints: stats.totalPoints,
      totalCorrect: stats.totalCorrect,
      highestWeek,
      secondHighestWeek,
    };
  });

  // Sort by tiebreaker rules
  standings.sort((a, b) => {
    if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
    if (a.totalCorrect !== b.totalCorrect) return b.totalCorrect - a.totalCorrect;
    const aHigh = a.highestWeek ?? 0;
    const bHigh = b.highestWeek ?? 0;
    if (aHigh !== bHigh) return bHigh - aHigh;
    return (b.secondHighestWeek ?? 0) - (a.secondHighestWeek ?? 0);
  });

  standings.forEach((s, i) => {
    s.rank = i + 1;
  });

  // Write standings cache
  const standingsRef = doc(db, `leagues/${leagueId}/standings/${season}`);
  await setDoc(standingsRef, {
    leagueId,
    season,
    lastUpdatedAt: Timestamp.now(),
    standings,
  } as schema.StandingsDoc);
}

/**
 * Get a player's own tiebreaker guess for a week (or null if not submitted yet)
 */
export async function getPlayerTiebreakerGuess(
  leagueId: string,
  playerId: string,
  week: number
): Promise<schema.TiebreakerGuessDoc | null> {
  const guessId = schema.getTiebreakerGuessId(playerId, week);
  const docRef = doc(db, `leagues/${leagueId}/tiebreakerGuesses`, guessId);
  const docSnap = await getDoc(docRef);
  return (docSnap.exists() ? docSnap.data() : null) as schema.TiebreakerGuessDoc | null;
}

/**
 * Get every submitted guess for a week — used by the commissioner hub to show
 * "X / Y entered" without exposing any individual guess value in that view.
 */
export async function getAllTiebreakerGuessesForWeek(
  leagueId: string,
  week: number
): Promise<schema.TiebreakerGuessDoc[]> {
  const q = query(
    collection(db, `leagues/${leagueId}/tiebreakerGuesses`),
    where("week", "==", week)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((d) => d.data() as schema.TiebreakerGuessDoc);
}

/**
 * Submit (or overwrite) a player's own tiebreaker guess. Autosaves — same
 * pattern as picks, no separate submit step.
 */
export async function submitTiebreakerGuess(
  leagueId: string,
  playerId: string,
  week: number,
  guess: number
): Promise<void> {
  const guessId = schema.getTiebreakerGuessId(playerId, week);
  const docRef = doc(db, `leagues/${leagueId}/tiebreakerGuesses`, guessId);
  await setDoc(docRef, {
    id: guessId,
    leagueId,
    playerId,
    week,
    guess,
    submittedAt: Timestamp.now(),
  } as schema.TiebreakerGuessDoc);
}

/**
 * Set weekly tiebreaker (commissioner only)
 */
/**
 * Set (or update) this week's tiebreaker question and rule. Deliberately
 * does NOT require an answer — the actual correct answer usually isn't
 * knowable until the relevant game finishes, well after players need to
 * start guessing. Preserves an existing answer/locked state if the doc
 * already exists (so re-editing the question text doesn't wipe out an
 * answer that's already been recorded).
 */
export async function setWeeklyTiebreakerQuestion(
  leagueId: string,
  week: number,
  question: string,
  rule: "closest" | "closest_without_going_over",
  commissionerId: string
): Promise<void> {
  const tiebreakerRef = doc(db, `leagues/${leagueId}/weeklyTiebreakers/${week}`);
  const existing = await getDoc(tiebreakerRef);
  await setDoc(
    tiebreakerRef,
    {
      leagueId,
      week,
      question,
      rule,
      answer: existing.exists() ? (existing.data() as schema.WeeklyTiebreakerDoc).answer : null,
      locked: existing.exists() ? (existing.data() as schema.WeeklyTiebreakerDoc).locked : false,
      enteredAt: Timestamp.now(),
      enteredBy: commissionerId,
    } as schema.WeeklyTiebreakerDoc
  );
}

/**
 * Record the actual correct answer once it's known (after the relevant
 * game finishes) — a separate action from setting the question, since
 * they're never knowable at the same time.
 */
export async function setWeeklyTiebreakerAnswer(
  leagueId: string,
  week: number,
  answer: number
): Promise<void> {
  const tiebreakerRef = doc(db, `leagues/${leagueId}/weeklyTiebreakers/${week}`);
  await updateDoc(tiebreakerRef, { answer });
  await resolveTiebreakerWinner(leagueId, week);
}

/**
 * Determines who actually won this week's tiebreaker and writes it onto
 * the (openly-readable) tiebreaker doc — the actual resolution logic that
 * was always described ("closest" or "closest without going over wins")
 * but never implemented; weekly ties were just being split evenly instead
 * of ever actually being broken. Requires commissioner-level access (needs
 * every player's guess), so this only ever runs from setWeeklyTiebreakerAnswer,
 * called by the commissioner.
 */
export async function resolveTiebreakerWinner(leagueId: string, week: number): Promise<void> {
  const tiebreakerRef = doc(db, `leagues/${leagueId}/weeklyTiebreakers/${week}`);
  const tbSnap = await getDoc(tiebreakerRef);
  if (!tbSnap.exists()) return;
  const tb = tbSnap.data() as schema.WeeklyTiebreakerDoc;
  if (tb.answer === null) return; // nothing to resolve against yet

  const guesses = await getAllTiebreakerGuessesForWeek(leagueId, week);
  if (guesses.length === 0) return;

  let winners: schema.TiebreakerGuessDoc[];
  if (tb.rule === "closest_without_going_over") {
    const notOver = guesses.filter((g) => g.guess <= tb.answer!);
    if (notOver.length > 0) {
      const maxGuess = Math.max(...notOver.map((g) => g.guess));
      winners = notOver.filter((g) => g.guess === maxGuess);
    } else {
      // Everybody went over — closest-over wins, per the original rule.
      const minOverDiff = Math.min(...guesses.map((g) => g.guess - tb.answer!));
      winners = guesses.filter((g) => g.guess - tb.answer! === minOverDiff);
    }
  } else {
    // "closest" — smallest absolute difference, either direction.
    const minDiff = Math.min(...guesses.map((g) => Math.abs(g.guess - tb.answer!)));
    winners = guesses.filter((g) => Math.abs(g.guess - tb.answer!) === minDiff);
  }

  await updateDoc(tiebreakerRef, { resolvedWinnerIds: winners.map((w) => w.playerId) });
}

/**
 * Lock this week's tiebreaker — no more guesses accepted after this (also
 * enforced server-side, see firestore.rules). Before locking, backfills a
 * guess for anyone who never submitted one, carried forward from their most
 * recent prior week's guess (if they have one) — so someone who reliably
 * enters guesses early in the season doesn't lose their shot at the
 * tiebreaker just because they forgot one particular week.
 */
export async function lockTiebreaker(leagueId: string, week: number): Promise<void> {
  const [players, thisWeekGuesses] = await Promise.all([
    getPlayers(leagueId),
    getAllTiebreakerGuessesForWeek(leagueId, week),
  ]);

  const alreadyGuessed = new Set(thisWeekGuesses.map((g) => g.playerId));
  const missing = players.filter((p) => !alreadyGuessed.has(p.id));

  if (missing.length > 0) {
    // Pull every prior-week guess for the missing players in one query,
    // then pick each player's most recent one client-side — cheaper than
    // one query per missing player.
    const priorGuessesSnap = await getDocs(
      query(collection(db, `leagues/${leagueId}/tiebreakerGuesses`), where("week", "<", week))
    );
    const priorGuesses = priorGuessesSnap.docs.map((d) => d.data() as schema.TiebreakerGuessDoc);

    const batch = writeBatch(db);
    missing.forEach((player) => {
      const theirPriorGuesses = priorGuesses
        .filter((g) => g.playerId === player.id)
        .sort((a, b) => b.week - a.week);
      if (theirPriorGuesses.length === 0) return; // nothing to carry forward
      const mostRecent = theirPriorGuesses[0];
      const guessId = schema.getTiebreakerGuessId(player.id, week);
      const guessRef = doc(db, `leagues/${leagueId}/tiebreakerGuesses`, guessId);
      batch.set(guessRef, {
        id: guessId,
        leagueId,
        playerId: player.id,
        week,
        guess: mostRecent.guess,
        submittedAt: Timestamp.now(),
        carriedForward: true,
      } as schema.TiebreakerGuessDoc);
    });
    await batch.commit();
  }

  const tiebreakerRef = doc(db, `leagues/${leagueId}/weeklyTiebreakers/${week}`);
  await updateDoc(tiebreakerRef, { locked: true });
}

/**
 * Manually unlock a tiebreaker (e.g. the commissioner locked it too early
 * by mistake). Does NOT undo any carried-forward guesses lockTiebreaker()
 * already wrote — those stay as real guesses unless someone overwrites
 * them, which is the same behavior as a normal guess once entered.
 */
export async function unlockTiebreaker(leagueId: string, week: number): Promise<void> {
  const tiebreakerRef = doc(db, `leagues/${leagueId}/weeklyTiebreakers/${week}`);
  await updateDoc(tiebreakerRef, { locked: false });
}

/**
 * Advance (or move back) the league's "current week" pointer — this is what
 * makes every player's picks screen and the commissioner hub open to a fresh
 * week by default. A commissioner action, not automatic: bye weeks and a
 * fixed test slate (Week 0) make inferring "the current week" from wall-clock
 * time unreliable, so it's an explicit switch instead.
 */
export async function setLeagueCurrentWeek(leagueId: string, week: number): Promise<void> {
  const leagueRef = doc(db, "leagues", leagueId);
  await updateDoc(leagueRef, { currentWeek: week, updatedAt: Timestamp.now() });
}

/**
 * Commissioner sets (or clears, with null) the signup cap. Enforced
 * client-side at signup — see the note in AuthContext.signUp for why this
 * isn't a hard server-side guarantee.
 */
export async function setLeagueMaxPlayers(leagueId: string, maxPlayers: number | null): Promise<void> {
  const leagueRef = doc(db, "leagues", leagueId);
  await updateDoc(leagueRef, { maxPlayers });
}

export async function setLeagueName(leagueId: string, name: string): Promise<void> {
  const leagueRef = doc(db, "leagues", leagueId);
  await updateDoc(leagueRef, { name });
}

/**
 * Commissioner sets the dues/payout structure. All amounts are entered
 * directly rather than computed from player count — deliberately flexible
 * so the commissioner can adjust as roster size firms up, rather than the
 * app guessing a scaling formula. seasonPayouts is always exactly 5 entries
 * (1st-5th); any entry can be 0/null if the league doesn't pay that deep.
 */
export async function setLeaguePayoutSettings(
  leagueId: string,
  settings: {
    entryFee: number | null;
    weeklyPayout: number | null;
    seasonPayouts: (number | null)[];
  }
): Promise<void> {
  const leagueRef = doc(db, "leagues", leagueId);
  await updateDoc(leagueRef, settings);
}

/**
 * Update a player's own display name. Security rules already permit this
 * (isSelf(playerId) on the players collection's update rule) — this is the
 * first place in the app that actually calls it.
 */
export async function updatePlayerName(leagueId: string, playerId: string, name: string): Promise<void> {
  const playerRef = doc(db, `leagues/${leagueId}/players`, playerId);
  await updateDoc(playerRef, { name });
}

/**
 * Commissioner records (or edits) a player's phone number — already
 * covered by the existing players-collection update rule (isSelf OR
 * isCommissioner), no rules change needed.
 */
export async function updatePlayerPhone(leagueId: string, playerId: string, phone: string): Promise<void> {
  const playerRef = doc(db, `leagues/${leagueId}/players`, playerId);
  await updateDoc(playerRef, { phone });
}

/**
 * A player's own self-lock on their picks for one week. Separate from the
 * per-game kickoff lock — this is purely a personal "I'm done deciding"
 * control, mainly useful for the commissioner (see PlayerWeekLockDoc).
 */
export async function getPlayerWeekLock(
  leagueId: string,
  playerId: string,
  week: number
): Promise<schema.PlayerWeekLockDoc | null> {
  const lockId = schema.getPlayerWeekLockId(playerId, week);
  const docRef = doc(db, `leagues/${leagueId}/playerWeekLocks`, lockId);
  const docSnap = await getDoc(docRef);
  return (docSnap.exists() ? docSnap.data() : null) as schema.PlayerWeekLockDoc | null;
}

export async function setPlayerWeekLock(
  leagueId: string,
  playerId: string,
  week: number,
  locked: boolean
): Promise<void> {
  const lockId = schema.getPlayerWeekLockId(playerId, week);
  const lockRef = doc(db, `leagues/${leagueId}/playerWeekLocks`, lockId);
  await setDoc(lockRef, {
    id: lockId,
    leagueId,
    playerId,
    week,
    locked,
    lockedAt: Timestamp.now(),
  } as schema.PlayerWeekLockDoc);
}

/**
 * Commissioner toggles a player's dues-paid status. Same field-level
 * privacy caveat as email on this same document: Firestore doesn't support
 * field-level rules, so this is technically readable by anyone signed in at
 * the database level, even though the UI only ever surfaces it on the
 * commissioner-only Members tab.
 */
export async function setPlayerPaidStatus(
  leagueId: string,
  playerId: string,
  hasPaid: boolean
): Promise<void> {
  const playerRef = doc(db, `leagues/${leagueId}/players`, playerId);
  await updateDoc(playerRef, { hasPaid });
}

/**
 * Commissioner "boots" a player. This is a soft-remove (sets a flag), not a
 * hard delete — deleting the doc outright would let AuthGate's self-heal
 * silently recreate it the next time that person opens the app. Their
 * historical picks are untouched; they just drop out of the active roster
 * (standings, pick counts, Members list) until restored. This does NOT
 * revoke their ability to sign back in — that needs their Firebase Auth
 * account disabled, which only the Firebase console can do, not this app.
 */
export async function removePlayerFromLeague(leagueId: string, playerId: string): Promise<void> {
  const playerRef = doc(db, `leagues/${leagueId}/players`, playerId);
  await updateDoc(playerRef, { removedFromLeague: true });
}

export async function restorePlayerToLeague(leagueId: string, playerId: string): Promise<void> {
  const playerRef = doc(db, `leagues/${leagueId}/players`, playerId);
  await updateDoc(playerRef, { removedFromLeague: false });
}

/**
 * Commissioner fills in a pick on behalf of a player who missed one before
 * their game locked. Marked isWildcard so it's visibly distinguishable from
 * a pick the player actually made themselves. If the game already has a
 * result (this pick was assigned after the fact, not just before results
 * came in), re-runs scoring for that game so the newly-added pick actually
 * gets counted — otherwise it would sit unscored forever, since
 * scoreGameImmediately only ever ran once, before this pick existed.
 */
export async function assignMissedPick(
  leagueId: string,
  playerId: string,
  gameId: string,
  week: number,
  pickedTeam: string
): Promise<void> {
  const pickId = schema.getPickId(playerId, gameId);
  const pickRef = doc(db, `leagues/${leagueId}/picks`, pickId);
  await setDoc(pickRef, {
    id: pickId,
    leagueId,
    playerId,
    gameId,
    week,
    pickedTeam,
    isWildcard: true,
    submittedAt: Timestamp.now(),
    // assignMissedPick only ever runs once a game's already locked (that's
    // what unlocks the "Fill in" UI in the first place), so this pick
    // should be visible right away, not wait for some future lock event
    // that's already happened.
    visibleToAll: true,
  } as schema.PickDoc);

  const gameRef = doc(db, `leagues/${leagueId}/games`, gameId);
  const gameSnap = await getDoc(gameRef);
  const game = gameSnap.data() as schema.GameDoc | undefined;
  if (game?.result) {
    await scoreGameImmediately(
      leagueId,
      gameId,
      week,
      game.result.winner,
      game.result.loser,
      game.playoffMultiplier
    );
  }
}

/**
 * Lock a game (call when game time passes)
 */
export async function lockGame(leagueId: string, gameId: string): Promise<void> {
  const gameRef = doc(db, `leagues/${leagueId}/games`, gameId);
  await updateDoc(gameRef, { isLocked: true });
  await recomputeGamePickCounts(leagueId, gameId);
  await markPicksVisibleForGame(leagueId, gameId);
}

/**
 * Commissioner's on-demand bulk version of the same thing the scheduled
 * GitHub Actions job does automatically every ~10 minutes (see
 * lock-passed-games.ts) — locks every game in this week whose kickoff has
 * already passed, in one click, rather than waiting for the next
 * scheduled run. Scoped to one week since that's the natural unit
 * ("once the Sunday games kick off"), not the whole season.
 */
export async function lockAllPassedKickoffGames(leagueId: string, week: number): Promise<number> {
  const gamesForWeek = await getGamesForWeek(leagueId, week);
  const now = Timestamp.now();
  const toLock = gamesForWeek.filter(
    (g) => !g.isLocked && !g.timeTBD && g.gameTime && g.gameTime.toMillis() <= now.toMillis()
  );

  if (toLock.length === 0) return 0;

  const batch = writeBatch(db);
  toLock.forEach((g) => {
    const gameRef = doc(db, `leagues/${leagueId}/games`, g.id);
    batch.update(gameRef, { isLocked: true });
  });
  await batch.commit();

  // Pick counts per game are cheap enough to just recompute individually
  // after the batch, same as the single-game lockGame() does.
  await Promise.all(toLock.map((g) => recomputeGamePickCounts(leagueId, g.id)));
  await Promise.all(toLock.map((g) => markPicksVisibleForGame(leagueId, g.id)));

  return toLock.length;
}

// ============================================================================
// SCHEDULE FLEX: reordering and time edits (commissioner only)
// ============================================================================

/**
 * Reorder a week's games. Pass the full list of game IDs for that week in the
 * new desired order — this rewrites every game's `order` field to match its
 * index in the array. Called after a drag/up-down reorder in the commissioner UI.
 *
 * Always sends the whole week's order, not a single before/after pair, so the
 * result is deterministic even if two games were mid-reorder at once.
 */
export async function reorderWeekGames(
  leagueId: string,
  orderedGameIds: string[]
): Promise<void> {
  const batch = writeBatch(db);
  orderedGameIds.forEach((gameId, index) => {
    const gameRef = doc(db, `leagues/${leagueId}/games`, gameId);
    batch.update(gameRef, { order: index });
  });
  await batch.commit();
}

/**
 * Set or update a game's kickoff time. Use this when a flex game's time is
 * announced, or when a late-season TBD game finally gets a real slot.
 * Passing gameTime: null with timeTBD: true clears a previously-set time back
 * to TBD (rare, but covers a schedule change getting walked back).
 */
export async function updateGameSchedule(
  leagueId: string,
  gameId: string,
  update: { gameTime: Date | null; timeTBD: boolean }
): Promise<void> {
  const gameRef = doc(db, `leagues/${leagueId}/games`, gameId);
  await updateDoc(gameRef, {
    gameTime: update.gameTime ? Timestamp.fromDate(update.gameTime) : null,
    timeTBD: update.timeTBD,
  });
}

/**
 * Manually lock a TBD game. Since a game with no gameTime can't lock itself
 * automatically at kickoff, this is the commissioner's override for closing
 * picks on a TBD game before its real time is ever set in the system.
 */
export async function setManualLock(
  leagueId: string,
  gameId: string,
  locked: boolean
): Promise<void> {
  const gameRef = doc(db, `leagues/${leagueId}/games`, gameId);
  await updateDoc(gameRef, {
    isManuallyLocked: locked,
    isLocked: locked,
  });
  if (locked) {
    await recomputeGamePickCounts(leagueId, gameId);
    await markPicksVisibleForGame(leagueId, gameId);
  }
}

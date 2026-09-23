/**
 * Auto-lock + free ESPN scoreboard sync
 *
 * 1. Locks any game whose kickoff has passed (or that ESPN already shows
 *    as in-progress / final) and marks that game's picks visibleToAll.
 * 2. When ESPN reports a game FINAL, writes the winner/score and scores
 *    picks — same outcome as the commissioner tapping the winning team.
 * 3. Stores an optional live score on the game doc while it's in progress.
 *
 * ESPN here is the unofficial public scoreboard JSON (no key, no fee).
 * If that fetch fails, kickoff-based locking still runs so Weekly Summary
 * isn't blocked on ESPN being up.
 *
 * Ties are left for the commissioner — this league's scoring assumes a
 * winner and a loser.
 *
 * Existing results are never overwritten. Wrong auto-result → Commissioner
 * Dashboard "Wrong? Fix it."
 *
 * Run:
 *   npm run lock:passed-games
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import * as path from "path";
import * as engine from "./pick-em-engine";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT_PATH. See WEEK0_SETUP.md.");
  process.exit(1);
}

const resolvedServiceAccountPath = path.resolve(process.cwd(), serviceAccountPath);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require(resolvedServiceAccountPath);

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const LEAGUE_ID = process.env.REACT_APP_LEAGUE_ID || "week0-test-league";
const ESPN_ENTERED_BY = "espn-scoreboard";

const ESPN_SCOREBOARD_URLS = [
  "https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
];

const TEAM_CODE_ALIASES: Record<string, string> = {
  WSH: "WAS",
  JAC: "JAX",
  LA: "LAR",
};

function normalizeTeam(code: string): string {
  const upper = (code || "").toUpperCase();
  return TEAM_CODE_ALIASES[upper] || upper;
}

function matchKey(away: string, home: string): string {
  return `${normalizeTeam(away)}@${normalizeTeam(home)}`;
}

type EspnGame = {
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
  state: "pre" | "in" | "post";
  completed: boolean;
  detail: string;
};

async function fetchEspnScoreboard(week: number, seasonType: number): Promise<EspnGame[]> {
  const params = `week=${week}&seasontype=${seasonType}`;
  let lastError: Error | null = null;

  for (const base of ESPN_SCOREBOARD_URLS) {
    try {
      const res = await fetch(`${base}?${params}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; pickem-app score sync)",
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        lastError = new Error(`${base} → ${res.status}`);
        continue;
      }
      const data = (await res.json()) as {
        events?: Array<{
          competitions?: Array<{
            status?: {
              type?: { state?: string; completed?: boolean; shortDetail?: string; detail?: string };
            };
            competitors?: Array<{
              homeAway?: string;
              score?: string | number;
              team?: { abbreviation?: string };
            }>;
          }>;
        }>;
      };
      const games: EspnGame[] = [];
      for (const event of data.events || []) {
        const comp = event.competitions?.[0];
        if (!comp) continue;
        const home = (comp.competitors || []).find((c) => c.homeAway === "home");
        const away = (comp.competitors || []).find((c) => c.homeAway === "away");
        if (!home?.team?.abbreviation || !away?.team?.abbreviation) continue;
        const status = comp.status?.type || {};
        const state = (status.state === "in" || status.state === "post" ? status.state : "pre") as
          | "pre"
          | "in"
          | "post";
        games.push({
          away: normalizeTeam(away.team.abbreviation),
          home: normalizeTeam(home.team.abbreviation),
          awayScore: Number(away.score || 0),
          homeScore: Number(home.score || 0),
          state,
          completed: !!status.completed,
          detail: status.shortDetail || status.detail || "",
        });
      }
      return games;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("ESPN scoreboard fetch failed");
}

async function markPicksVisible(gameId: string): Promise<void> {
  const picksSnap = await db
    .collection("leagues")
    .doc(LEAGUE_ID)
    .collection("picks")
    .where("gameId", "==", gameId)
    .get();
  if (picksSnap.empty) return;
  const batch = db.batch();
  picksSnap.docs.forEach((pickDoc) => {
    batch.update(pickDoc.ref, { visibleToAll: true });
  });
  await batch.commit();
}

async function writePickCounts(gameId: string, picks: FirebaseFirestore.QueryDocumentSnapshot[]): Promise<void> {
  const counts: { [team: string]: number } = {};
  picks.forEach((d) => {
    const team = d.data().pickedTeam as string;
    counts[team] = (counts[team] || 0) + 1;
  });
  await db
    .collection("leagues")
    .doc(LEAGUE_ID)
    .collection("gamePickCounts")
    .doc(gameId)
    .set({
      gameId,
      leagueId: LEAGUE_ID,
      counts,
      updatedAt: Timestamp.now(),
    });
}

async function scoreGameAndRefresh(gameId: string, week: number, winner: string, loser: string, multiplier: number) {
  const leagueRef = db.collection("leagues").doc(LEAGUE_ID);
  const picksSnap = await leagueRef.collection("picks").where("gameId", "==", gameId).get();
  const picksByTeam = new Map<string, number>();
  picksSnap.docs.forEach((d) => {
    const team = d.data().pickedTeam as string;
    picksByTeam.set(team, (picksByTeam.get(team) || 0) + 1);
  });
  const points = engine.scoreGame(
    gameId,
    { gameId, winner, loser, winnerScore: 0, loserScore: 0 },
    picksByTeam,
    multiplier || 1
  );

  if (!picksSnap.empty) {
    const batch = db.batch();
    picksSnap.docs.forEach((pickDoc) => {
      const isCorrect = pickDoc.data().pickedTeam === winner;
      batch.update(pickDoc.ref, {
        isCorrect,
        pointsAwarded: isCorrect ? points : 0,
        visibleToAll: true,
      });
    });
    await batch.commit();
  }

  await writePickCounts(gameId, picksSnap.docs);
  await recalculateWeeklyScores(week);
  await recalculateSeasonStandings();
}

async function recalculateWeeklyScores(week: number) {
  const leagueRef = db.collection("leagues").doc(LEAGUE_ID);
  const [playersSnap, picksSnap] = await Promise.all([
    leagueRef.collection("players").get(),
    leagueRef.collection("picks").where("week", "==", week).get(),
  ]);
  const scores = playersSnap.docs.map((playerDoc) => {
    const player = playerDoc.data();
    const theirPicks = picksSnap.docs
      .map((d) => d.data())
      .filter((p) => p.playerId === player.id && p.pointsAwarded !== undefined);
    const pointsAfterMultiplier = theirPicks.reduce((sum, p) => sum + (p.pointsAwarded || 0), 0);
    return {
      playerId: player.id,
      playerName: player.name,
      gamesCorrect: theirPicks.filter((p) => p.isCorrect).length,
      pointsRaw: pointsAfterMultiplier,
      pointsAfterMultiplier,
    };
  });
  await leagueRef.collection("weeklyScores").doc(String(week)).set({
    leagueId: LEAGUE_ID,
    week,
    scoredAt: Timestamp.now(),
    scores,
  });
}

async function recalculateSeasonStandings() {
  const leagueRef = db.collection("leagues").doc(LEAGUE_ID);
  const leagueSnap = await leagueRef.get();
  if (!leagueSnap.exists) return;
  const season = leagueSnap.data()!.season;
  const playersSnap = await leagueRef.collection("players").get();
  const players = playersSnap.docs.map((d) => d.data());

  const playerStats = new Map<string, { totalPoints: number; totalCorrect: number; name: string }>();
  players.forEach((p: any) => playerStats.set(p.id, { totalPoints: 0, totalCorrect: 0, name: p.name }));

  for (const player of players as any[]) {
    const picksSnap = await leagueRef.collection("picks").where("playerId", "==", player.id).get();
    picksSnap.docs.forEach((d) => {
      const pick = d.data();
      if (pick.week === 0) return;
      const stats = playerStats.get(player.id);
      if (stats && pick.pointsAwarded !== undefined) {
        stats.totalPoints += pick.pointsAwarded;
        if (pick.isCorrect) stats.totalCorrect += 1;
      }
    });
  }

  const standings = Array.from(playerStats.entries())
    .map(([playerId, stats]) => ({
      rank: 0,
      playerId,
      playerName: stats.name,
      totalPoints: stats.totalPoints,
      totalCorrect: stats.totalCorrect,
      highestWeek: null as number | null,
      secondHighestWeek: null as number | null,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints || b.totalCorrect - a.totalCorrect);
  standings.forEach((s, i) => (s.rank = i + 1));

  await leagueRef.collection("standings").doc(String(season)).set({
    leagueId: LEAGUE_ID,
    season,
    lastUpdatedAt: Timestamp.now(),
    standings,
  });
}

async function revealTiebreakerGuesses(
  gamesSnap: FirebaseFirestore.QuerySnapshot,
  extraLockedIds: Set<string>
) {
  let revealedWeeks = 0;
  const allWeeks = new Set(gamesSnap.docs.map((d) => d.data().week as number));
  for (const week of allWeeks) {
    const weekGames = gamesSnap.docs.filter((d) => d.data().week === week);
    if (weekGames.length === 0) continue;
    const last = weekGames.reduce((best, d) =>
      (d.data().order ?? 0) >= (best.data().order ?? 0) ? d : best
    );
    const lastLocked = last.data().isLocked || extraLockedIds.has(last.id);
    if (!lastLocked) continue;

    const guessesSnap = await db
      .collection("leagues")
      .doc(LEAGUE_ID)
      .collection("tiebreakerGuesses")
      .where("week", "==", week)
      .get();
    if (guessesSnap.empty) continue;
    const hidden = guessesSnap.docs.filter((guessDoc) => guessDoc.data().visibleToAll !== true);
    if (hidden.length === 0) continue;
    const tbBatch = db.batch();
    hidden.forEach((guessDoc) => {
      tbBatch.update(guessDoc.ref, { visibleToAll: true });
    });
    await tbBatch.commit();
    revealedWeeks++;
  }
  return revealedWeeks;
}

async function lockPassedGames() {
  const leagueRef = db.collection("leagues").doc(LEAGUE_ID);
  const gamesSnap = await leagueRef.collection("games").get();
  const now = Timestamp.now();
  const extraLockedIds = new Set<string>();

  const nflWeeks = new Set<number>();
  gamesSnap.docs.forEach((doc) => {
    const g = doc.data();
    if (g.week <= 0) return;
    const missingResult = !g.result;
    const missingScores =
      !!g.result && (g.result.winnerScore || 0) === 0 && (g.result.loserScore || 0) === 0;
    if (missingResult || missingScores || !g.isLocked) nflWeeks.add(g.week);
  });

  const espnByMatch = new Map<string, EspnGame>();
  for (const week of nflWeeks) {
    const seasonType = week >= 19 ? 3 : 2;
    const espnWeek = week >= 19 ? week - 18 : week;
    try {
      const espnGames = await fetchEspnScoreboard(espnWeek, seasonType);
      console.log(`ESPN week ${week}: ${espnGames.length} game(s)`);
      espnGames.forEach((eg) => espnByMatch.set(matchKey(eg.away, eg.home), eg));
    } catch (err) {
      console.warn(`ESPN fetch failed for week ${week}:`, err instanceof Error ? err.message : err);
    }
  }

  const toLock: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (const doc of gamesSnap.docs) {
    const g = doc.data();
    if (g.isLocked) continue;
    const espn = espnByMatch.get(matchKey(g.awayTeam, g.homeTeam));
    const espnStarted = !!espn && espn.state !== "pre";
    const kickoffPassed = !g.timeTBD && !!g.gameTime && g.gameTime.toMillis() <= now.toMillis();
    if (espnStarted || kickoffPassed) {
      toLock.push(doc);
    }
  }

  if (toLock.length > 0) {
    const batch = db.batch();
    toLock.forEach((doc) => {
      const g = doc.data();
      console.log(`  Locking ${g.awayTeam} @ ${g.homeTeam} (week ${g.week})`);
      batch.update(doc.ref, { isLocked: true });
      extraLockedIds.add(doc.id);
    });
    await batch.commit();
    for (const gameDoc of toLock) {
      await markPicksVisible(gameDoc.id);
      const picksSnap = await leagueRef.collection("picks").where("gameId", "==", gameDoc.id).get();
      await writePickCounts(gameDoc.id, picksSnap.docs);
    }
  }

  let finalsEntered = 0;
  let scoresFilled = 0;
  let tiesSkipped = 0;
  for (const doc of gamesSnap.docs) {
    const g = doc.data();
    if (g.week === 0) continue;
    const espn = espnByMatch.get(matchKey(g.awayTeam, g.homeTeam));
    if (!espn) continue;

    if (espn.state === "in" && !g.result) {
      await doc.ref.update({
        isLocked: true,
        live: {
          awayScore: espn.awayScore,
          homeScore: espn.homeScore,
          status: "in_progress",
          detail: espn.detail,
          updatedAt: Timestamp.now(),
        },
      });
      extraLockedIds.add(doc.id);
      continue;
    }

    if (!espn.completed && espn.state !== "post") continue;

    if (espn.awayScore === espn.homeScore) {
      console.log(`  Tie (left for commissioner): ${espn.away} @ ${espn.home} ${espn.awayScore}-${espn.homeScore}`);
      tiesSkipped++;
      continue;
    }

    const homeWon = espn.homeScore > espn.awayScore;
    const espnWinner = homeWon ? g.homeTeam : g.awayTeam;
    const espnLoser = homeWon ? g.awayTeam : g.homeTeam;

    if (g.result) {
      const missingScores = (g.result.winnerScore || 0) === 0 && (g.result.loserScore || 0) === 0;
      if (!missingScores) continue;
      const winner = g.result.winner;
      const winnerScore = winner === g.homeTeam ? espn.homeScore : espn.awayScore;
      const loserScore = winner === g.homeTeam ? espn.awayScore : espn.homeScore;
      console.log(
        `  Filling score ${g.awayTeam} @ ${g.homeTeam}: ${winner} ${winnerScore}-${loserScore}`
      );
      await doc.ref.update({
        "result.winnerScore": winnerScore,
        "result.loserScore": loserScore,
        live: FieldValue.delete(),
      });
      scoresFilled++;
      continue;
    }

    const winnerScore = homeWon ? espn.homeScore : espn.awayScore;
    const loserScore = homeWon ? espn.awayScore : espn.homeScore;

    console.log(`  Final ${g.awayTeam} @ ${g.homeTeam}: ${espnWinner} ${winnerScore}-${loserScore}`);
    await doc.ref.update({
      isLocked: true,
      "result.winner": espnWinner,
      "result.loser": espnLoser,
      "result.winnerScore": winnerScore,
      "result.loserScore": loserScore,
      "result.resultEnteredAt": Timestamp.now(),
      "result.resultEnteredBy": ESPN_ENTERED_BY,
      live: FieldValue.delete(),
    });
    extraLockedIds.add(doc.id);
    await scoreGameAndRefresh(doc.id, g.week, espnWinner, espnLoser, g.playoffMultiplier || 1);
    finalsEntered++;
  }

  const revealedWeeks = await revealTiebreakerGuesses(gamesSnap, extraLockedIds);

  if (
    toLock.length === 0 &&
    revealedWeeks === 0 &&
    finalsEntered === 0 &&
    scoresFilled === 0 &&
    tiesSkipped === 0
  ) {
    console.log("No games need locking or scoring.");
    return;
  }

  console.log(
    `\nLocked ${toLock.length} game(s). Entered ${finalsEntered} final(s). ` +
      `Filled scores on ${scoresFilled} existing result(s). ` +
      `Revealed tiebreaker guesses for ${revealedWeeks} week(s).` +
      (tiesSkipped ? ` Skipped ${tiesSkipped} tie(s).` : "")
  );
}

lockPassedGames().catch((err) => {
  console.error("Lock / score sync failed:", err);
  process.exit(1);
});

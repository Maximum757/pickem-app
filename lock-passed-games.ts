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
 * Ties are a wash: the result is saved with winner/loser "TIE", so no pick
 * matches and nobody gets points for that game.
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

function etWeekday(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(ms));
}

// Monday games lock at the latest Sunday kickoff that week.
function lockMillis(
  g: FirebaseFirestore.DocumentData,
  snap: FirebaseFirestore.QuerySnapshot
): number | null {
  if (g.timeTBD || !g.gameTime) return null;
  const own = g.gameTime.toMillis() as number;
  if (etWeekday(own) !== "Mon") return own;
  let latestSunday: number | null = null;
  snap.docs.forEach((d) => {
    const other = d.data();
    if (other.week !== g.week || other.timeTBD || !other.gameTime) return;
    const ms = other.gameTime.toMillis() as number;
    if (etWeekday(ms) !== "Sun") return;
    if (latestSunday === null || ms > latestSunday) latestSunday = ms;
  });
  return latestSunday ?? own;
}
const TIE = "TIE";

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

async function markPicksVisible(gameId: string) {
  const picksSnap = await db
    .collection("leagues")
    .doc(LEAGUE_ID)
    .collection("picks")
    .where("gameId", "==", gameId)
    .get();
  if (picksSnap.empty) return picksSnap;
  const batch = db.batch();
  picksSnap.docs.forEach((pickDoc) => {
    batch.update(pickDoc.ref, { visibleToAll: true });
  });
  await batch.commit();
  return picksSnap;
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

type GameDelta = { playerId: string; points: number; correct: boolean };

async function scoreGameAndRefresh(
  gameId: string,
  week: number,
  season: number,
  winner: string,
  loser: string,
  multiplier: number
) {
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

  const deltas: GameDelta[] = picksSnap.docs.map((pickDoc) => {
    const correct = pickDoc.data().pickedTeam === winner;
    return { playerId: pickDoc.data().playerId as string, points: correct ? points : 0, correct };
  });

  if (!picksSnap.empty) {
    const batch = db.batch();
    picksSnap.docs.forEach((pickDoc, i) => {
      batch.update(pickDoc.ref, {
        isCorrect: deltas[i].correct,
        pointsAwarded: deltas[i].points,
        visibleToAll: true,
      });
    });
    await batch.commit();
  }

  await writePickCounts(gameId, picksSnap.docs);
  // Add this game onto the totals already stored. Re-reading every pick in
  // the season here was most of the daily Firestore quota.
  await addGameToWeeklyScores(week, deltas);
  await addGameToStandings(season, deltas);
}

async function addGameToWeeklyScores(week: number, deltas: GameDelta[]) {
  const leagueRef = db.collection("leagues").doc(LEAGUE_ID);
  const ref = leagueRef.collection("weeklyScores").doc(String(week));
  const snap = await ref.get();
  const scores: any[] = snap.exists ? snap.data()!.scores.map((s: any) => ({ ...s })) : [];
  if (!snap.exists) {
    const playersSnap = await leagueRef.collection("players").get();
    playersSnap.docs.forEach((playerDoc) => {
      scores.push({
        playerId: playerDoc.id,
        playerName: playerDoc.data().name,
        gamesCorrect: 0,
        pointsRaw: 0,
        pointsAfterMultiplier: 0,
      });
    });
  }
  const byId = new Map(scores.map((s) => [s.playerId as string, s]));
  deltas.forEach((d) => {
    const row = byId.get(d.playerId);
    if (!row) return;
    row.pointsRaw += d.points;
    row.pointsAfterMultiplier += d.points;
    if (d.correct) row.gamesCorrect += 1;
  });
  await ref.set({
    leagueId: LEAGUE_ID,
    week,
    scoredAt: Timestamp.now(),
    scores,
  });
}

async function addGameToStandings(season: number, deltas: GameDelta[]) {
  const ref = db.collection("leagues").doc(LEAGUE_ID).collection("standings").doc(String(season));
  const snap = await ref.get();
  if (!snap.exists) {
    console.warn("No standings doc yet; this final was not added to season totals.");
    return;
  }
  const standings: any[] = snap.data()!.standings.map((s: any) => ({ ...s }));
  const byId = new Map(standings.map((s) => [s.playerId as string, s]));
  deltas.forEach((d) => {
    const row = byId.get(d.playerId);
    if (!row) return;
    row.totalPoints += d.points;
    if (d.correct) row.totalCorrect += 1;
  });
  standings.sort((a, b) => b.totalPoints - a.totalPoints || b.totalCorrect - a.totalCorrect);
  standings.forEach((s, i) => (s.rank = i + 1));
  await ref.set({
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
  const leagueSnap = await leagueRef.get();
  if (!leagueSnap.exists) throw new Error(`League ${LEAGUE_ID} not found`);
  const currentWeek = leagueSnap.data()!.currentWeek as number;
  const season = leagueSnap.data()!.season as number;
  // One week, not all 18. A full-season read every 15 minutes was enough
  // on its own to burn through the free daily quota.
  const gamesSnap = await leagueRef.collection("games").where("week", "==", currentWeek).get();
  console.log(`Week ${currentWeek}: ${gamesSnap.size} game(s)`);
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

  for (const doc of gamesSnap.docs) {
    const g = doc.data();
    const locks = lockMillis(g, gamesSnap);
    const own = g.gameTime?.toMillis?.() as number | undefined;
    if (locks === null || own === undefined || locks >= own) continue;
    if (g.locksAt?.toMillis?.() === locks) continue;
    await doc.ref.update({ locksAt: Timestamp.fromMillis(locks) });
    console.log(`  ${g.awayTeam} @ ${g.homeTeam} (week ${g.week}) locks at Sunday night`);
  }

  const toLock: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (const doc of gamesSnap.docs) {
    const g = doc.data();
    if (g.isLocked) continue;
    const espn = espnByMatch.get(matchKey(g.awayTeam, g.homeTeam));
    const espnStarted = !!espn && espn.state !== "pre";
    const locks = lockMillis(g, gamesSnap);
    const kickoffPassed = locks !== null && locks <= now.toMillis();
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
      const picksSnap = await markPicksVisible(gameDoc.id);
      await writePickCounts(gameDoc.id, picksSnap.docs);
    }
  }

  let finalsEntered = 0;
  let scoresFilled = 0;
  let tiesEntered = 0;
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

    const isTie = espn.awayScore === espn.homeScore;
    const homeWon = espn.homeScore > espn.awayScore;
    const espnWinner = isTie ? TIE : homeWon ? g.homeTeam : g.awayTeam;
    const espnLoser = isTie ? TIE : homeWon ? g.awayTeam : g.homeTeam;

    if (g.result) {
      const missingScores = (g.result.winnerScore || 0) === 0 && (g.result.loserScore || 0) === 0;
      if (!missingScores) continue;
      const winner = g.result.winner;
      if (winner === TIE && !isTie) continue;
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

    console.log(
      isTie
        ? `  Final ${g.awayTeam} @ ${g.homeTeam}: tie ${winnerScore}-${loserScore}, nobody scores`
        : `  Final ${g.awayTeam} @ ${g.homeTeam}: ${espnWinner} ${winnerScore}-${loserScore}`
    );
    if (isTie) tiesEntered++;
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
    await scoreGameAndRefresh(doc.id, g.week, season, espnWinner, espnLoser, g.playoffMultiplier || 1);
    finalsEntered++;
  }

  const revealedWeeks = await revealTiebreakerGuesses(gamesSnap, extraLockedIds);

  if (
    toLock.length === 0 &&
    revealedWeeks === 0 &&
    finalsEntered === 0 &&
    scoresFilled === 0
  ) {
    console.log("No games need locking or scoring.");
    return;
  }

  console.log(
    `\nLocked ${toLock.length} game(s). Entered ${finalsEntered} final(s). ` +
      `Filled scores on ${scoresFilled} existing result(s). ` +
      `Revealed tiebreaker guesses for ${revealedWeeks} week(s).` +
      (tiesEntered ? ` ${tiesEntered} of those finals were ties (nobody scores).` : "")
  );
}

lockPassedGames().catch((err) => {
  console.error("Lock / score sync failed:", err);
  process.exit(1);
});

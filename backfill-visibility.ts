/**
 * One-time visibleToAll backfill
 *
 * markPicksVisibleForGame() (and the scheduled auto-lock job) only sets
 * visibleToAll going FORWARD, at the moment a game locks. Any game that
 * was already locked before that mechanism existed has picks sitting with
 * visibleToAll unset — meaning nobody but the picker themselves (and the
 * commissioner) can see them, even though the game itself is long since
 * locked. This walks every already-locked game once and fixes that.
 *
 * Also backfills the commissioner's own picks for any week they'd already
 * locked before this existed, same idea.
 *
 * Safe to re-run — anything already marked visible just gets set to true
 * again, a no-op.
 *
 * Run:
 *   npm run backfill:visibility
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as path from "path";

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

async function backfill() {
  const leagueRef = db.collection("leagues").doc(LEAGUE_ID);

  // Part 1: every already-locked game's picks.
  const gamesSnap = await leagueRef.collection("games").where("isLocked", "==", true).get();
  console.log(`Found ${gamesSnap.size} already-locked games.`);

  let pickCount = 0;
  for (const gameDoc of gamesSnap.docs) {
    const g = gameDoc.data();
    const picksSnap = await leagueRef.collection("picks").where("gameId", "==", gameDoc.id).get();
    if (picksSnap.empty) continue;

    const batch = db.batch();
    picksSnap.docs.forEach((pickDoc) => {
      batch.update(pickDoc.ref, { visibleToAll: true });
    });
    await batch.commit();
    pickCount += picksSnap.size;
    console.log(`  ${g.awayTeam} @ ${g.homeTeam} (week ${g.week}): ${picksSnap.size} picks marked visible`);
  }

  // Part 2: the commissioner's own picks for any week they'd already locked.
  const leagueDoc = await leagueRef.get();
  const commissionerId = leagueDoc.data()?.commissionerId;
  let commissionerPickCount = 0;
  if (commissionerId) {
    const locksSnap = await leagueRef
      .collection("playerWeekLocks")
      .where("playerId", "==", commissionerId)
      .where("locked", "==", true)
      .get();
    console.log(`\nFound ${locksSnap.size} already-locked commissioner weeks.`);

    for (const lockDoc of locksSnap.docs) {
      const week = lockDoc.data().week;
      const picksSnap = await leagueRef
        .collection("picks")
        .where("playerId", "==", commissionerId)
        .where("week", "==", week)
        .get();
      if (picksSnap.empty) continue;

      const batch = db.batch();
      picksSnap.docs.forEach((pickDoc) => {
        batch.update(pickDoc.ref, { visibleToAll: true });
      });
      await batch.commit();
      commissionerPickCount += picksSnap.size;
      console.log(`  Week ${week}: ${picksSnap.size} commissioner picks marked visible`);
    }
  }

  console.log(
    `\nDone. ${pickCount} picks marked visible from locked games, ${commissionerPickCount} from locked commissioner weeks.`
  );
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});

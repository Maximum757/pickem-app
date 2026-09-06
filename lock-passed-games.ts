/**
 * Auto-lock script
 *
 * Sets isLocked: true on any game whose kickoff has already passed but
 * hasn't been flipped yet, and marks that game's picks visibleToAll —
 * the actual mechanism behind "games lock automatically at kickoff." Picks
 * were already blocked at kickoff by the security rules regardless of this
 * field, but OTHER players' picks only get revealed to everyone (Weekly
 * Summary, Standings) once visibleToAll is genuinely set on each pick —
 * nothing was ever setting either field automatically before this. Meant
 * to run frequently (see .github/workflows/auto-lock-games.yml) so the gap
 * between "kickoff happens" and "picks actually reveal" stays small — not
 * instant, but not dependent on anyone opening the app either.
 *
 * Also available as an on-demand manual action from the Commissioner
 * Dashboard ("Lock all games past kickoff") for anyone who wants it to
 * happen immediately rather than waiting for the next scheduled run.
 *
 * Run:
 *   npm run lock:passed-games
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
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

async function lockPassedGames() {
  const gamesSnap = await db.collection("leagues").doc(LEAGUE_ID).collection("games").get();
  const now = Timestamp.now();

  const toLock = gamesSnap.docs.filter((doc) => {
    const g = doc.data();
    if (g.isLocked) return false;
    if (g.timeTBD || !g.gameTime) return false; // nothing to compare against
    return g.gameTime.toMillis() <= now.toMillis();
  });

  if (toLock.length === 0) {
    console.log("No games need locking.");
    return;
  }

  const batch = db.batch();
  toLock.forEach((doc) => {
    const g = doc.data();
    console.log(`  Locking ${g.awayTeam} @ ${g.homeTeam} (week ${g.week})`);
    batch.update(doc.ref, { isLocked: true });
  });
  await batch.commit();

  // Mark every pick for each newly-locked game as visible — same
  // denormalized field the app's own markPicksVisibleForGame() sets, kept
  // in sync here since this script runs independently via GitHub Actions.
  for (const gameDoc of toLock) {
    const picksSnap = await db
      .collection("leagues")
      .doc(LEAGUE_ID)
      .collection("picks")
      .where("gameId", "==", gameDoc.id)
      .get();
    if (picksSnap.empty) continue;
    const pickBatch = db.batch();
    picksSnap.docs.forEach((pickDoc) => {
      pickBatch.update(pickDoc.ref, { visibleToAll: true });
    });
    await pickBatch.commit();
  }

  console.log(`\nLocked ${toLock.length} game(s).`);
}

lockPassedGames().catch((err) => {
  console.error("Lock check failed:", err);
  process.exit(1);
});

/**
 * Week 0 seed script
 *
 * Writes the real Sept 2026 college football test slate into Firestore as
 * week: 0 — a dry run of the actual app/auth/scoring stack before NFL Week 1
 * money is on the line. Run once, before testers start signing up:
 *
 *   npm run seed:week0
 *
 * Uses the Firebase ADMIN SDK, not the client SDK — this script writes
 * directly as a trusted server-side actor and bypasses firestore.rules
 * entirely, which is correct here and NOT a workaround: an unauthenticated
 * seed script can never satisfy the real security rules (the very first
 * write creates the league doc that the commissioner-check itself depends
 * on — a genuine chicken-and-egg case), and trusted local admin scripts are
 * exactly what the Admin SDK exists for. The rules stay untouched and fully
 * enforced for every real player/commissioner action in the actual app.
 *
 * Needs a service account key — see WEEK0_SETUP.md for the one-time steps
 * to download one from the Firebase console. Never commit that key file;
 * .gitignore already excludes it.
 *
 * Safe to re-run — it overwrites the same game ids rather than duplicating them.
 *
 * Team colors here are BORROWED FROM NFL TEAMS, one-for-one, purely to test
 * the color-coded pick tiles without hand-building a second 32-team color
 * table for a one-week test. Swap in real college colors if Week 0 becomes
 * a recurring thing rather than a one-off dry run.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  console.error(
    "Missing FIREBASE_SERVICE_ACCOUNT_PATH. Set it to the path of your downloaded " +
      "service account JSON — see WEEK0_SETUP.md for how to get one."
  );
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
import * as path from "path";

// require() resolves relative paths against the COMPILED file's location
// (dist-seed/), not the folder the command was run from — so a bare
// require(serviceAccountPath) would look in the wrong place. Resolving
// against process.cwd() makes the path behave the way the .env.local
// setting actually reads: relative to your project root.
const resolvedServiceAccountPath = path.resolve(process.cwd(), serviceAccountPath);
const serviceAccount = require(resolvedServiceAccountPath);

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

const LEAGUE_ID = "week0-test-league";

// team -> borrowed NFL color pair (bg/fg), reusing the same palette approach
// as the real NFL picks screen. One college team per NFL team, 32-for-32.
const TEST_COLORS: Record<string, { bg: string; fg: string }> = {
  "North Texas": { bg: "#97233F", fg: "#FFFFFF" }, // ARI
  Indiana: { bg: "#A71930", fg: "#000000" }, // ATL
  "East Carolina": { bg: "#241773", fg: "#9E7C0C" }, // BAL
  Alabama: { bg: "#00338D", fg: "#C60C30" }, // BUF
  "Ball State": { bg: "#0085CA", fg: "#101820" }, // CAR
  "Ohio State": { bg: "#0B162A", fg: "#C83803" }, // CHI
  "Tennessee State": { bg: "#FB4F14", fg: "#000000" }, // CIN
  Georgia: { bg: "#311D00", fg: "#FF3C00" }, // CLE
  Baylor: { bg: "#041E42", fg: "#FFFFFF" }, // DAL
  Auburn: { bg: "#FB4F14", fg: "#002244" }, // DEN
  "Boise State": { bg: "#0076B6", fg: "#B0B7BC" }, // DET
  Oregon: { bg: "#203731", fg: "#FFB612" }, // GB
  "Texas State": { bg: "#03202F", fg: "#A71930" }, // HOU
  Texas: { bg: "#002C5F", fg: "#A2AAAD" }, // IND
  Tulane: { bg: "#006778", fg: "#9F792C" }, // JAX
  Duke: { bg: "#E31837", fg: "#FFB81C" }, // KC
  Clemson: { bg: "#000000", fg: "#A5ACAF" }, // LV
  LSU: { bg: "#0080C6", fg: "#FFC20E" }, // LAC
  "Western Michigan": { bg: "#003594", fg: "#FFA300" }, // LAR
  Michigan: { bg: "#008E97", fg: "#FC4C02" }, // MIA
  "Florida Atlantic": { bg: "#4F2683", fg: "#FFC62F" }, // MIN
  Florida: { bg: "#002244", fg: "#C60C30" }, // NE
  UCLA: { bg: "#D3BC8D", fg: "#101820" }, // NO
  California: { bg: "#0B2265", fg: "#A71930" }, // NYG
  "Washington State": { bg: "#125740", fg: "#FFFFFF" }, // NYJ
  Washington: { bg: "#004C54", fg: "#A5ACAF" }, // PHI
  Louisville: { bg: "#FFB612", fg: "#101820" }, // PIT
  "Ole Miss": { bg: "#AA0000", fg: "#B3995D" }, // SF
  Wisconsin: { bg: "#69BE28", fg: "#002244" }, // SEA
  "Notre Dame": { bg: "#FF7900", fg: "#D50A0A" }, // TB
  SMU: { bg: "#0C2340", fg: "#8A8D8F" }, // TEN
  "Florida State": { bg: "#5A1414", fg: "#FFB612" }, // WAS
};

interface Week0Game {
  id: string;
  away: string;
  home: string;
  kickoff: string; // ISO string, ET
  neutralSite?: string;
}

// Order here IS the pick-sheet order (see `order` field on GameDoc) — Saturday
// games first in kickoff order, then Sunday, then Monday. Matches what was
// agreed: Thu/Fri games dropped for lead time, all ranked Sun/Mon games added.
const WEEK0_GAMES: Week0Game[] = [
  { id: "w0-1", away: "North Texas", home: "Indiana", kickoff: "2026-09-05T16:00:00-04:00" },
  { id: "w0-2", away: "East Carolina", home: "Alabama", kickoff: "2026-09-05T16:00:00-04:00" },
  { id: "w0-3", away: "Ball State", home: "Ohio State", kickoff: "2026-09-05T16:30:00-04:00" },
  { id: "w0-4", away: "Tennessee State", home: "Georgia", kickoff: "2026-09-05T19:00:00-04:00" },
  { id: "w0-5", away: "Baylor", home: "Auburn", kickoff: "2026-09-05T19:30:00-04:00", neutralSite: "Atlanta, GA" },
  { id: "w0-6", away: "Boise State", home: "Oregon", kickoff: "2026-09-05T19:30:00-04:00" },
  { id: "w0-7", away: "Texas State", home: "Texas", kickoff: "2026-09-05T19:30:00-04:00" },
  { id: "w0-8", away: "Tulane", home: "Duke", kickoff: "2026-09-05T19:30:00-04:00" },
  { id: "w0-9", away: "Clemson", home: "LSU", kickoff: "2026-09-05T23:30:00-04:00" },
  { id: "w0-10", away: "Western Michigan", home: "Michigan", kickoff: "2026-09-05T23:30:00-04:00" },
  { id: "w0-11", away: "Florida Atlantic", home: "Florida", kickoff: "2026-09-05T23:45:00-04:00" },
  { id: "w0-12", away: "UCLA", home: "California", kickoff: "2026-09-06T02:30:00-04:00" },
  { id: "w0-13", away: "Washington State", home: "Washington", kickoff: "2026-09-06T20:00:00-04:00" },
  { id: "w0-14", away: "Louisville", home: "Ole Miss", kickoff: "2026-09-06T23:30:00-04:00", neutralSite: "Nashville, TN" },
  { id: "w0-15", away: "Wisconsin", home: "Notre Dame", kickoff: "2026-09-06T23:30:00-04:00", neutralSite: "Green Bay, WI" },
  { id: "w0-16", away: "SMU", home: "Florida State", kickoff: "2026-09-07T23:30:00-04:00" },
];

async function seedWeek0() {
  console.log(`Seeding ${WEEK0_GAMES.length} Week 0 games into league "${LEAGUE_ID}"...`);

  for (let i = 0; i < WEEK0_GAMES.length; i++) {
    const g = WEEK0_GAMES[i];
    await db
      .collection("leagues")
      .doc(LEAGUE_ID)
      .collection("games")
      .doc(g.id)
      .set({
        id: g.id,
        leagueId: LEAGUE_ID,
        week: 0,
        order: i,
        homeTeam: g.home,
        awayTeam: g.away,
        gameTime: Timestamp.fromDate(new Date(g.kickoff)),
        timeTBD: false,
        isPlayoff: false,
        playoffMultiplier: 1,
        isLocked: false,
        isManuallyLocked: false,
      });
    console.log(`  ${i + 1}/${WEEK0_GAMES.length}: ${g.away} @ ${g.home}`);
  }

  // Seed the league doc itself if it doesn't exist yet, so signup/auth has
  // somewhere to attach players to. Commissioner id gets set separately —
  // see WEEK0_SETUP.md step "Set yourself as commissioner."
  await db.collection("leagues").doc(LEAGUE_ID).set(
    {
      id: LEAGUE_ID,
      name: "Week 0 Test",
      season: 2026,
      playerCount: 0,
      currentWeek: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );

  console.log("Done. Games are seeded with real colors/team names but NFL-borrowed color pairs.");
  console.log("Next: set commissionerId on the league doc, then send signup links to testers.");
}

seedWeek0().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

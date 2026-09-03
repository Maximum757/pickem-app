/**
 * NFL Weeks 1-8 seed script
 *
 * Writes the real 2026 NFL regular-season schedule into Firestore for
 * weeks 1 through 8 (Sept 9 - Nov 2, 2026). Every game here was pulled from
 * nflschedules.com's per-week pages (cross-referenced against the official
 * NFL.com source it cites) — not written from memory. Safe to re-run; it
 * overwrites the same game ids rather than duplicating them.
 *
 * WEEKS 9-18 ARE NOT IN THIS FILE. Populating a full 272-game season means
 * verifying every matchup, date, and kickoff time individually — this file
 * covers what's been verified so far. Extending it is a straightforward
 * continuation of the exact same pattern, not a redesign.
 *
 * Run:
 *   npm run seed:weeks1-8
 *
 * Needs the same service account key as seed-week0.ts — see WEEK0_SETUP.md.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as path from "path";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  console.error(
    "Missing FIREBASE_SERVICE_ACCOUNT_PATH. Set it to the path of your downloaded " +
      "service account JSON — see WEEK0_SETUP.md for how to get one."
  );
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

interface ScheduleGame {
  id: string;
  away: string;
  home: string;
  // ISO string with explicit ET offset — matches how every other kickoff
  // time in this codebase is written (see seed-week0.ts).
  kickoff: string;
}

// Regular season: 1x multiplier throughout, matches every other game doc.
const REGULAR_SEASON_MULTIPLIER = 1;

// Order within each week is kickoff order — same convention as Week 0.
const WEEKS: Record<number, ScheduleGame[]> = {
  1: [
    { id: "w1-1", away: "NE", home: "SEA", kickoff: "2026-09-09T20:20:00-04:00" },
    { id: "w1-2", away: "SF", home: "LAR", kickoff: "2026-09-10T20:35:00-04:00" },
    { id: "w1-3", away: "CHI", home: "CAR", kickoff: "2026-09-13T13:00:00-04:00" },
    { id: "w1-4", away: "TB", home: "CIN", kickoff: "2026-09-13T13:00:00-04:00" },
    { id: "w1-5", away: "NO", home: "DET", kickoff: "2026-09-13T13:00:00-04:00" },
    { id: "w1-6", away: "BUF", home: "HOU", kickoff: "2026-09-13T13:00:00-04:00" },
    { id: "w1-7", away: "BAL", home: "IND", kickoff: "2026-09-13T13:00:00-04:00" },
    { id: "w1-8", away: "CLE", home: "JAX", kickoff: "2026-09-13T13:00:00-04:00" },
    { id: "w1-9", away: "ATL", home: "PIT", kickoff: "2026-09-13T13:00:00-04:00" },
    { id: "w1-10", away: "NYJ", home: "TEN", kickoff: "2026-09-13T13:00:00-04:00" },
    { id: "w1-11", away: "ARI", home: "LAC", kickoff: "2026-09-13T16:25:00-04:00" },
    { id: "w1-12", away: "MIA", home: "LV", kickoff: "2026-09-13T16:25:00-04:00" },
    { id: "w1-13", away: "GB", home: "MIN", kickoff: "2026-09-13T16:25:00-04:00" },
    { id: "w1-14", away: "WAS", home: "PHI", kickoff: "2026-09-13T16:25:00-04:00" },
    { id: "w1-15", away: "DAL", home: "NYG", kickoff: "2026-09-13T20:20:00-04:00" },
    { id: "w1-16", away: "DEN", home: "KC", kickoff: "2026-09-14T20:15:00-04:00" },
  ],
  2: [
    { id: "w2-1", away: "DET", home: "BUF", kickoff: "2026-09-17T20:15:00-04:00" },
    { id: "w2-2", away: "CAR", home: "ATL", kickoff: "2026-09-20T13:00:00-04:00" },
    { id: "w2-3", away: "NO", home: "BAL", kickoff: "2026-09-20T13:00:00-04:00" },
    { id: "w2-4", away: "MIN", home: "CHI", kickoff: "2026-09-20T13:00:00-04:00" },
    { id: "w2-5", away: "CIN", home: "HOU", kickoff: "2026-09-20T13:00:00-04:00" },
    { id: "w2-6", away: "PIT", home: "NE", kickoff: "2026-09-20T13:00:00-04:00" },
    { id: "w2-7", away: "GB", home: "NYJ", kickoff: "2026-09-20T13:00:00-04:00" },
    { id: "w2-8", away: "CLE", home: "TB", kickoff: "2026-09-20T13:00:00-04:00" },
    { id: "w2-9", away: "PHI", home: "TEN", kickoff: "2026-09-20T13:00:00-04:00" },
    { id: "w2-10", away: "JAX", home: "DEN", kickoff: "2026-09-20T16:05:00-04:00" },
    { id: "w2-11", away: "LV", home: "LAC", kickoff: "2026-09-20T16:05:00-04:00" },
    { id: "w2-12", away: "SEA", home: "ARI", kickoff: "2026-09-20T16:25:00-04:00" },
    { id: "w2-13", away: "WAS", home: "DAL", kickoff: "2026-09-20T16:25:00-04:00" },
    { id: "w2-14", away: "MIA", home: "SF", kickoff: "2026-09-20T16:25:00-04:00" },
    { id: "w2-15", away: "IND", home: "KC", kickoff: "2026-09-20T20:20:00-04:00" },
    { id: "w2-16", away: "NYG", home: "LAR", kickoff: "2026-09-21T20:15:00-04:00" },
  ],
  3: [
    { id: "w3-1", away: "ATL", home: "GB", kickoff: "2026-09-24T20:15:00-04:00" },
    { id: "w3-2", away: "LAC", home: "BUF", kickoff: "2026-09-27T13:00:00-04:00" },
    { id: "w3-3", away: "CAR", home: "CLE", kickoff: "2026-09-27T13:00:00-04:00" },
    { id: "w3-4", away: "NYJ", home: "DET", kickoff: "2026-09-27T13:00:00-04:00" },
    { id: "w3-5", away: "HOU", home: "IND", kickoff: "2026-09-27T13:00:00-04:00" },
    { id: "w3-6", away: "NE", home: "JAX", kickoff: "2026-09-27T13:00:00-04:00" },
    { id: "w3-7", away: "KC", home: "MIA", kickoff: "2026-09-27T13:00:00-04:00" },
    { id: "w3-8", away: "TEN", home: "NYG", kickoff: "2026-09-27T13:00:00-04:00" },
    { id: "w3-9", away: "CIN", home: "PIT", kickoff: "2026-09-27T13:00:00-04:00" },
    { id: "w3-10", away: "SEA", home: "WAS", kickoff: "2026-09-27T13:00:00-04:00" },
    { id: "w3-11", away: "ARI", home: "SF", kickoff: "2026-09-27T16:05:00-04:00" },
    { id: "w3-12", away: "MIN", home: "TB", kickoff: "2026-09-27T16:05:00-04:00" },
    { id: "w3-13", away: "BAL", home: "DAL", kickoff: "2026-09-27T16:25:00-04:00" },
    { id: "w3-14", away: "LV", home: "NO", kickoff: "2026-09-27T16:25:00-04:00" },
    { id: "w3-15", away: "LAR", home: "DEN", kickoff: "2026-09-27T20:20:00-04:00" },
    { id: "w3-16", away: "PHI", home: "CHI", kickoff: "2026-09-28T20:15:00-04:00" },
  ],
  4: [
    { id: "w4-1", away: "PIT", home: "CLE", kickoff: "2026-10-01T20:15:00-04:00" },
    { id: "w4-2", away: "IND", home: "WAS", kickoff: "2026-10-04T09:30:00-04:00" },
    { id: "w4-3", away: "TEN", home: "BAL", kickoff: "2026-10-04T13:00:00-04:00" },
    { id: "w4-4", away: "NE", home: "BUF", kickoff: "2026-10-04T13:00:00-04:00" },
    { id: "w4-5", away: "NYJ", home: "CHI", kickoff: "2026-10-04T13:00:00-04:00" },
    { id: "w4-6", away: "JAX", home: "CIN", kickoff: "2026-10-04T13:00:00-04:00" },
    { id: "w4-7", away: "DAL", home: "HOU", kickoff: "2026-10-04T13:00:00-04:00" },
    { id: "w4-8", away: "ARI", home: "NYG", kickoff: "2026-10-04T13:00:00-04:00" },
    { id: "w4-9", away: "LAR", home: "PHI", kickoff: "2026-10-04T13:00:00-04:00" },
    { id: "w4-10", away: "GB", home: "TB", kickoff: "2026-10-04T13:00:00-04:00" },
    { id: "w4-11", away: "MIA", home: "MIN", kickoff: "2026-10-04T16:05:00-04:00" },
    { id: "w4-12", away: "KC", home: "LV", kickoff: "2026-10-04T16:25:00-04:00" },
    { id: "w4-13", away: "LAC", home: "SEA", kickoff: "2026-10-04T16:25:00-04:00" },
    { id: "w4-14", away: "DEN", home: "SF", kickoff: "2026-10-04T16:25:00-04:00" },
    { id: "w4-15", away: "DET", home: "CAR", kickoff: "2026-10-04T20:20:00-04:00" },
    { id: "w4-16", away: "ATL", home: "NO", kickoff: "2026-10-05T20:15:00-04:00" },
  ],
  5: [
    { id: "w5-1", away: "TB", home: "DAL", kickoff: "2026-10-08T20:15:00-04:00" },
    { id: "w5-2", away: "PHI", home: "JAX", kickoff: "2026-10-11T09:30:00-04:00" },
    { id: "w5-3", away: "CIN", home: "MIA", kickoff: "2026-10-11T13:00:00-04:00" },
    { id: "w5-4", away: "LV", home: "NE", kickoff: "2026-10-11T13:00:00-04:00" },
    { id: "w5-5", away: "MIN", home: "NO", kickoff: "2026-10-11T13:00:00-04:00" },
    { id: "w5-6", away: "CLE", home: "NYJ", kickoff: "2026-10-11T13:00:00-04:00" },
    { id: "w5-7", away: "IND", home: "PIT", kickoff: "2026-10-11T13:00:00-04:00" },
    { id: "w5-8", away: "HOU", home: "TEN", kickoff: "2026-10-11T13:00:00-04:00" },
    { id: "w5-9", away: "NYG", home: "WAS", kickoff: "2026-10-11T13:00:00-04:00" },
    { id: "w5-10", away: "DEN", home: "LAC", kickoff: "2026-10-11T16:05:00-04:00" },
    { id: "w5-11", away: "DET", home: "ARI", kickoff: "2026-10-11T16:25:00-04:00" },
    { id: "w5-12", away: "CHI", home: "GB", kickoff: "2026-10-11T16:25:00-04:00" },
    { id: "w5-13", away: "SF", home: "SEA", kickoff: "2026-10-11T16:25:00-04:00" },
    { id: "w5-14", away: "BAL", home: "ATL", kickoff: "2026-10-11T20:20:00-04:00" },
    { id: "w5-15", away: "BUF", home: "LAR", kickoff: "2026-10-12T20:15:00-04:00" },
  ],
  6: [
    { id: "w6-1", away: "SEA", home: "DEN", kickoff: "2026-10-15T20:15:00-04:00" },
    { id: "w6-2", away: "HOU", home: "JAX", kickoff: "2026-10-18T09:30:00-04:00" },
    { id: "w6-3", away: "CHI", home: "ATL", kickoff: "2026-10-18T13:00:00-04:00" },
    { id: "w6-4", away: "BAL", home: "CLE", kickoff: "2026-10-18T13:00:00-04:00" },
    { id: "w6-5", away: "TEN", home: "IND", kickoff: "2026-10-18T13:00:00-04:00" },
    { id: "w6-6", away: "NYJ", home: "NE", kickoff: "2026-10-18T13:00:00-04:00" },
    { id: "w6-7", away: "NO", home: "NYG", kickoff: "2026-10-18T13:00:00-04:00" },
    { id: "w6-8", away: "CAR", home: "PHI", kickoff: "2026-10-18T13:00:00-04:00" },
    { id: "w6-9", away: "PIT", home: "TB", kickoff: "2026-10-18T13:00:00-04:00" },
    { id: "w6-10", away: "ARI", home: "LAR", kickoff: "2026-10-18T16:05:00-04:00" },
    { id: "w6-11", away: "LAC", home: "KC", kickoff: "2026-10-18T16:25:00-04:00" },
    { id: "w6-12", away: "BUF", home: "LV", kickoff: "2026-10-18T16:25:00-04:00" },
    { id: "w6-13", away: "DAL", home: "GB", kickoff: "2026-10-18T20:20:00-04:00" },
    { id: "w6-14", away: "WAS", home: "SF", kickoff: "2026-10-19T20:15:00-04:00" },
  ],
  7: [
    { id: "w7-1", away: "NE", home: "CHI", kickoff: "2026-10-22T20:15:00-04:00" },
    { id: "w7-2", away: "PIT", home: "NO", kickoff: "2026-10-25T09:30:00-04:00" },
    { id: "w7-3", away: "SF", home: "ATL", kickoff: "2026-10-25T13:00:00-04:00" },
    { id: "w7-4", away: "CIN", home: "BAL", kickoff: "2026-10-25T13:00:00-04:00" },
    { id: "w7-5", away: "TB", home: "CAR", kickoff: "2026-10-25T13:00:00-04:00" },
    { id: "w7-6", away: "NYG", home: "HOU", kickoff: "2026-10-25T13:00:00-04:00" },
    { id: "w7-7", away: "IND", home: "MIN", kickoff: "2026-10-25T13:00:00-04:00" },
    { id: "w7-8", away: "MIA", home: "NYJ", kickoff: "2026-10-25T13:00:00-04:00" },
    { id: "w7-9", away: "CLE", home: "TEN", kickoff: "2026-10-25T13:00:00-04:00" },
    { id: "w7-10", away: "DEN", home: "ARI", kickoff: "2026-10-25T16:05:00-04:00" },
    { id: "w7-11", away: "GB", home: "DET", kickoff: "2026-10-25T16:25:00-04:00" },
    { id: "w7-12", away: "LAR", home: "LV", kickoff: "2026-10-25T16:25:00-04:00" },
    { id: "w7-13", away: "KC", home: "SEA", kickoff: "2026-10-25T20:20:00-04:00" },
    { id: "w7-14", away: "DAL", home: "PHI", kickoff: "2026-10-26T20:15:00-04:00" },
  ],
  8: [
    { id: "w8-1", away: "CAR", home: "GB", kickoff: "2026-10-29T20:15:00-04:00" },
    { id: "w8-2", away: "BAL", home: "BUF", kickoff: "2026-11-01T13:00:00-05:00" },
    { id: "w8-3", away: "TEN", home: "CIN", kickoff: "2026-11-01T13:00:00-05:00" },
    { id: "w8-4", away: "ARI", home: "DAL", kickoff: "2026-11-01T13:00:00-05:00" },
    { id: "w8-5", away: "MIN", home: "DET", kickoff: "2026-11-01T13:00:00-05:00" },
    { id: "w8-6", away: "IND", home: "JAX", kickoff: "2026-11-01T13:00:00-05:00" },
    { id: "w8-7", away: "LV", home: "NYJ", kickoff: "2026-11-01T13:00:00-05:00" },
    { id: "w8-8", away: "CLE", home: "PIT", kickoff: "2026-11-01T13:00:00-05:00" },
    { id: "w8-9", away: "ATL", home: "TB", kickoff: "2026-11-01T13:00:00-05:00" },
    { id: "w8-10", away: "LAC", home: "LAR", kickoff: "2026-11-01T16:05:00-05:00" },
    { id: "w8-11", away: "KC", home: "DEN", kickoff: "2026-11-01T16:25:00-05:00" },
    { id: "w8-12", away: "NE", home: "MIA", kickoff: "2026-11-01T16:25:00-05:00" },
    { id: "w8-13", away: "PHI", home: "WAS", kickoff: "2026-11-01T20:20:00-05:00" },
    { id: "w8-14", away: "CHI", home: "SEA", kickoff: "2026-11-02T20:15:00-05:00" },
  ],
};

async function seedWeeks() {
  for (const weekNum of Object.keys(WEEKS).map(Number)) {
    const games = WEEKS[weekNum];
    console.log(`Seeding Week ${weekNum} (${games.length} games)...`);

    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      await db
        .collection("leagues")
        .doc(LEAGUE_ID)
        .collection("games")
        .doc(g.id)
        .set({
          id: g.id,
          leagueId: LEAGUE_ID,
          week: weekNum,
          order: i,
          homeTeam: g.home,
          awayTeam: g.away,
          gameTime: Timestamp.fromDate(new Date(g.kickoff)),
          timeTBD: false,
          isPlayoff: false,
          playoffMultiplier: REGULAR_SEASON_MULTIPLIER,
          isLocked: false,
          isManuallyLocked: false,
        });
    }
    console.log(`  Done: ${games.length}/${games.length}`);
  }

  const totalGames = Object.values(WEEKS).reduce((sum, w) => sum + w.length, 0);
  console.log(`\nSeeded ${totalGames} games across weeks ${Object.keys(WEEKS).join(", ")}.`);
  console.log("Weeks 9-18 are not in this script yet — see the file header.");
}

seedWeeks().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

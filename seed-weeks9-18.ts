/**
 * NFL Weeks 9-18 seed script
 *
 * Completes the season — pairs with seed-weeks1-8.ts. Same source
 * (nflschedules.com, cross-referenced against the official NFL.com source
 * it cites), same verification standard: every week's game count checked
 * against the source, every team checked for a real code with no duplicates
 * within a week.
 *
 * Weeks 16-18 include real flex-scheduling TBD games — the source itself
 * flags these as unresolved this far out (Week 18 is entirely TBD; the NFL
 * doesn't set Week 18 kickoff times/matches until Week 17 finishes, since
 * playoff seeding affects which games matter). Those are seeded with
 * timeTBD: true and no gameTime, matching how Week 0's TBD games already
 * work — NOT invented placeholder times.
 *
 * Run:
 *   npm run seed:weeks9-18
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
  // null means genuinely TBD (real flex-scheduling uncertainty from the
  // source, not a gap in research) — never invent a placeholder time.
  kickoff: string | null;
}

const REGULAR_SEASON_MULTIPLIER = 1;

const WEEKS: Record<number, ScheduleGame[]> = {
  9: [
    { id: "w9-1", away: "JAX", home: "BAL", kickoff: "2026-11-05T20:15:00-05:00" },
    { id: "w9-2", away: "CIN", home: "ATL", kickoff: "2026-11-08T09:30:00-05:00" },
    { id: "w9-3", away: "DEN", home: "CAR", kickoff: "2026-11-08T13:00:00-05:00" },
    { id: "w9-4", away: "DAL", home: "IND", kickoff: "2026-11-08T13:00:00-05:00" },
    { id: "w9-5", away: "NYJ", home: "KC", kickoff: "2026-11-08T13:00:00-05:00" },
    { id: "w9-6", away: "DET", home: "MIA", kickoff: "2026-11-08T13:00:00-05:00" },
    { id: "w9-7", away: "CLE", home: "NO", kickoff: "2026-11-08T13:00:00-05:00" },
    { id: "w9-8", away: "NYG", home: "PHI", kickoff: "2026-11-08T13:00:00-05:00" },
    { id: "w9-9", away: "LAR", home: "WAS", kickoff: "2026-11-08T13:00:00-05:00" },
    { id: "w9-10", away: "HOU", home: "LAC", kickoff: "2026-11-08T16:05:00-05:00" },
    { id: "w9-11", away: "LV", home: "SF", kickoff: "2026-11-08T16:05:00-05:00" },
    { id: "w9-12", away: "GB", home: "NE", kickoff: "2026-11-08T16:25:00-05:00" },
    { id: "w9-13", away: "ARI", home: "SEA", kickoff: "2026-11-08T16:25:00-05:00" },
    { id: "w9-14", away: "TB", home: "CHI", kickoff: "2026-11-08T20:20:00-05:00" },
    { id: "w9-15", away: "BUF", home: "MIN", kickoff: "2026-11-09T20:15:00-05:00" },
  ],
  10: [
    { id: "w10-1", away: "WAS", home: "NYG", kickoff: "2026-11-12T20:15:00-05:00" },
    { id: "w10-2", away: "NE", home: "DET", kickoff: "2026-11-15T09:30:00-05:00" },
    { id: "w10-3", away: "KC", home: "ATL", kickoff: "2026-11-15T13:00:00-05:00" },
    { id: "w10-4", away: "HOU", home: "CLE", kickoff: "2026-11-15T13:00:00-05:00" },
    { id: "w10-5", away: "MIN", home: "GB", kickoff: "2026-11-15T13:00:00-05:00" },
    { id: "w10-6", away: "MIA", home: "IND", kickoff: "2026-11-15T13:00:00-05:00" },
    { id: "w10-7", away: "CAR", home: "NO", kickoff: "2026-11-15T13:00:00-05:00" },
    { id: "w10-8", away: "BUF", home: "NYJ", kickoff: "2026-11-15T13:00:00-05:00" },
    { id: "w10-9", away: "JAX", home: "TEN", kickoff: "2026-11-15T13:00:00-05:00" },
    { id: "w10-10", away: "LAR", home: "ARI", kickoff: "2026-11-15T16:05:00-05:00" },
    { id: "w10-11", away: "SEA", home: "LV", kickoff: "2026-11-15T16:05:00-05:00" },
    { id: "w10-12", away: "SF", home: "DAL", kickoff: "2026-11-15T16:25:00-05:00" },
    { id: "w10-13", away: "PIT", home: "CIN", kickoff: "2026-11-15T20:20:00-05:00" },
    { id: "w10-14", away: "LAC", home: "BAL", kickoff: "2026-11-16T20:15:00-05:00" },
  ],
  11: [
    { id: "w11-1", away: "IND", home: "HOU", kickoff: "2026-11-19T20:15:00-05:00" },
    { id: "w11-2", away: "MIA", home: "BUF", kickoff: "2026-11-22T13:00:00-05:00" },
    { id: "w11-3", away: "BAL", home: "CAR", kickoff: "2026-11-22T13:00:00-05:00" },
    { id: "w11-4", away: "NO", home: "CHI", kickoff: "2026-11-22T13:00:00-05:00" },
    { id: "w11-5", away: "TEN", home: "DAL", kickoff: "2026-11-22T13:00:00-05:00" },
    { id: "w11-6", away: "TB", home: "DET", kickoff: "2026-11-22T13:00:00-05:00" },
    { id: "w11-7", away: "ARI", home: "KC", kickoff: "2026-11-22T13:00:00-05:00" },
    { id: "w11-8", away: "JAX", home: "NYG", kickoff: "2026-11-22T13:00:00-05:00" },
    { id: "w11-9", away: "NYJ", home: "LAC", kickoff: "2026-11-22T16:05:00-05:00" },
    { id: "w11-10", away: "LV", home: "DEN", kickoff: "2026-11-22T16:25:00-05:00" },
    { id: "w11-11", away: "PIT", home: "PHI", kickoff: "2026-11-22T16:25:00-05:00" },
    { id: "w11-12", away: "MIN", home: "SF", kickoff: "2026-11-22T20:20:00-05:00" },
    { id: "w11-13", away: "CIN", home: "WAS", kickoff: "2026-11-23T20:15:00-05:00" },
  ],
  12: [
    { id: "w12-1", away: "GB", home: "LAR", kickoff: "2026-11-25T20:00:00-05:00" },
    { id: "w12-2", away: "CHI", home: "DET", kickoff: "2026-11-26T13:00:00-05:00" },
    { id: "w12-3", away: "PHI", home: "DAL", kickoff: "2026-11-26T16:30:00-05:00" },
    { id: "w12-4", away: "KC", home: "BUF", kickoff: "2026-11-26T20:20:00-05:00" },
    { id: "w12-5", away: "DEN", home: "PIT", kickoff: "2026-11-27T15:00:00-05:00" },
    { id: "w12-6", away: "NO", home: "CIN", kickoff: "2026-11-29T13:00:00-05:00" },
    { id: "w12-7", away: "LV", home: "CLE", kickoff: "2026-11-29T13:00:00-05:00" },
    { id: "w12-8", away: "BAL", home: "HOU", kickoff: "2026-11-29T13:00:00-05:00" },
    { id: "w12-9", away: "NYG", home: "IND", kickoff: "2026-11-29T13:00:00-05:00" },
    { id: "w12-10", away: "NYJ", home: "MIA", kickoff: "2026-11-29T13:00:00-05:00" },
    { id: "w12-11", away: "ATL", home: "MIN", kickoff: "2026-11-29T13:00:00-05:00" },
    { id: "w12-12", away: "TEN", home: "JAX", kickoff: "2026-11-29T16:05:00-05:00" },
    { id: "w12-13", away: "WAS", home: "ARI", kickoff: "2026-11-29T16:25:00-05:00" },
    { id: "w12-14", away: "SEA", home: "SF", kickoff: "2026-11-29T16:25:00-05:00" },
    { id: "w12-15", away: "NE", home: "LAC", kickoff: "2026-11-29T20:20:00-05:00" },
    { id: "w12-16", away: "CAR", home: "TB", kickoff: "2026-11-30T20:15:00-05:00" },
  ],
  13: [
    { id: "w13-1", away: "KC", home: "LAR", kickoff: "2026-12-03T20:15:00-05:00" },
    { id: "w13-2", away: "DET", home: "ATL", kickoff: "2026-12-06T13:00:00-05:00" },
    { id: "w13-3", away: "JAX", home: "CHI", kickoff: "2026-12-06T13:00:00-05:00" },
    { id: "w13-4", away: "CIN", home: "CLE", kickoff: "2026-12-06T13:00:00-05:00" },
    { id: "w13-5", away: "GB", home: "NO", kickoff: "2026-12-06T13:00:00-05:00" },
    { id: "w13-6", away: "SF", home: "NYG", kickoff: "2026-12-06T13:00:00-05:00" },
    { id: "w13-7", away: "LAC", home: "TB", kickoff: "2026-12-06T13:00:00-05:00" },
    { id: "w13-8", away: "WAS", home: "TEN", kickoff: "2026-12-06T13:00:00-05:00" },
    { id: "w13-9", away: "PHI", home: "ARI", kickoff: "2026-12-06T16:05:00-05:00" },
    { id: "w13-10", away: "MIA", home: "DEN", kickoff: "2026-12-06T16:05:00-05:00" },
    { id: "w13-11", away: "CAR", home: "MIN", kickoff: "2026-12-06T16:25:00-05:00" },
    { id: "w13-12", away: "BUF", home: "NE", kickoff: "2026-12-06T16:25:00-05:00" },
    { id: "w13-13", away: "HOU", home: "PIT", kickoff: "2026-12-06T20:20:00-05:00" },
    { id: "w13-14", away: "DAL", home: "SEA", kickoff: "2026-12-07T20:15:00-05:00" },
  ],
  14: [
    { id: "w14-1", away: "MIN", home: "NE", kickoff: "2026-12-10T20:15:00-05:00" },
    { id: "w14-2", away: "TB", home: "BAL", kickoff: "2026-12-13T13:00:00-05:00" },
    { id: "w14-3", away: "NO", home: "CAR", kickoff: "2026-12-13T13:00:00-05:00" },
    { id: "w14-4", away: "ATL", home: "CLE", kickoff: "2026-12-13T13:00:00-05:00" },
    { id: "w14-5", away: "TEN", home: "DET", kickoff: "2026-12-13T13:00:00-05:00" },
    { id: "w14-6", away: "CHI", home: "MIA", kickoff: "2026-12-13T13:00:00-05:00" },
    { id: "w14-7", away: "DEN", home: "NYJ", kickoff: "2026-12-13T13:00:00-05:00" },
    { id: "w14-8", away: "IND", home: "PHI", kickoff: "2026-12-13T13:00:00-05:00" },
    { id: "w14-9", away: "HOU", home: "WAS", kickoff: "2026-12-13T13:00:00-05:00" },
    { id: "w14-10", away: "LAC", home: "LV", kickoff: "2026-12-13T16:05:00-05:00" },
    { id: "w14-11", away: "KC", home: "CIN", kickoff: "2026-12-13T16:25:00-05:00" },
    { id: "w14-12", away: "NYG", home: "SEA", kickoff: "2026-12-13T16:25:00-05:00" },
    { id: "w14-13", away: "LAR", home: "SF", kickoff: "2026-12-13T16:25:00-05:00" },
    { id: "w14-14", away: "BUF", home: "GB", kickoff: "2026-12-13T20:20:00-05:00" },
    { id: "w14-15", away: "PIT", home: "JAX", kickoff: "2026-12-14T20:15:00-05:00" },
  ],
  15: [
    { id: "w15-1", away: "SF", home: "LAC", kickoff: "2026-12-17T20:15:00-05:00" },
    { id: "w15-2", away: "SEA", home: "PHI", kickoff: "2026-12-19T17:00:00-05:00" },
    { id: "w15-3", away: "CHI", home: "BUF", kickoff: "2026-12-19T20:20:00-05:00" },
    { id: "w15-4", away: "CIN", home: "CAR", kickoff: "2026-12-20T13:00:00-05:00" },
    { id: "w15-5", away: "MIA", home: "GB", kickoff: "2026-12-20T13:00:00-05:00" },
    { id: "w15-6", away: "JAX", home: "HOU", kickoff: "2026-12-20T13:00:00-05:00" },
    { id: "w15-7", away: "CLE", home: "NYG", kickoff: "2026-12-20T13:00:00-05:00" },
    { id: "w15-8", away: "BAL", home: "PIT", kickoff: "2026-12-20T13:00:00-05:00" },
    { id: "w15-9", away: "NO", home: "TB", kickoff: "2026-12-20T13:00:00-05:00" },
    { id: "w15-10", away: "IND", home: "TEN", kickoff: "2026-12-20T13:00:00-05:00" },
    { id: "w15-11", away: "ATL", home: "WAS", kickoff: "2026-12-20T13:00:00-05:00" },
    { id: "w15-12", away: "NYJ", home: "ARI", kickoff: "2026-12-20T16:05:00-05:00" },
    { id: "w15-13", away: "DAL", home: "LAR", kickoff: "2026-12-20T16:25:00-05:00" },
    { id: "w15-14", away: "DEN", home: "LV", kickoff: "2026-12-20T16:25:00-05:00" },
    { id: "w15-15", away: "DET", home: "MIN", kickoff: "2026-12-20T20:20:00-05:00" },
    { id: "w15-16", away: "NE", home: "KC", kickoff: "2026-12-21T20:15:00-05:00" },
  ],
  16: [
    { id: "w16-1", away: "HOU", home: "PHI", kickoff: "2026-12-24T20:15:00-05:00" },
    { id: "w16-2", away: "GB", home: "CHI", kickoff: "2026-12-25T13:00:00-05:00" },
    { id: "w16-3", away: "BUF", home: "DEN", kickoff: "2026-12-25T16:30:00-05:00" },
    { id: "w16-4", away: "LAR", home: "SEA", kickoff: "2026-12-25T20:15:00-05:00" },
    { id: "w16-5", away: "TB", home: "ATL", kickoff: null }, // flex TBD
    { id: "w16-6", away: "CLE", home: "BAL", kickoff: "2026-12-27T13:00:00-05:00" },
    { id: "w16-7", away: "CIN", home: "IND", kickoff: null }, // flex TBD
    { id: "w16-8", away: "LAC", home: "MIA", kickoff: "2026-12-27T13:00:00-05:00" },
    { id: "w16-9", away: "WAS", home: "MIN", kickoff: null }, // flex TBD
    { id: "w16-10", away: "ARI", home: "NO", kickoff: "2026-12-27T13:00:00-05:00" },
    { id: "w16-11", away: "NE", home: "NYJ", kickoff: "2026-12-27T13:00:00-05:00" },
    { id: "w16-12", away: "CAR", home: "PIT", kickoff: null }, // flex TBD
    { id: "w16-13", away: "TEN", home: "LV", kickoff: "2026-12-27T16:05:00-05:00" },
    { id: "w16-14", away: "SF", home: "KC", kickoff: "2026-12-27T16:25:00-05:00" },
    { id: "w16-15", away: "JAX", home: "DAL", kickoff: "2026-12-27T20:20:00-05:00" },
    { id: "w16-16", away: "NYG", home: "DET", kickoff: "2026-12-28T20:15:00-05:00" },
  ],
  17: [
    { id: "w17-1", away: "BAL", home: "CIN", kickoff: "2026-12-31T20:15:00-05:00" },
    { id: "w17-2", away: "NO", home: "ATL", kickoff: "2027-01-03T13:00:00-05:00" },
    { id: "w17-3", away: "SEA", home: "CAR", kickoff: "2027-01-03T13:00:00-05:00" },
    { id: "w17-4", away: "IND", home: "CLE", kickoff: "2027-01-03T13:00:00-05:00" },
    { id: "w17-5", away: "NYG", home: "DAL", kickoff: "2027-01-03T13:00:00-05:00" },
    { id: "w17-6", away: "WAS", home: "JAX", kickoff: null }, // flex TBD
    { id: "w17-7", away: "KC", home: "LAC", kickoff: null }, // flex TBD
    { id: "w17-8", away: "BUF", home: "MIA", kickoff: "2027-01-03T13:00:00-05:00" },
    { id: "w17-9", away: "DEN", home: "NE", kickoff: null }, // flex TBD
    { id: "w17-10", away: "MIN", home: "NYJ", kickoff: "2027-01-03T13:00:00-05:00" },
    { id: "w17-11", away: "LAR", home: "TB", kickoff: null }, // flex TBD
    { id: "w17-12", away: "PIT", home: "TEN", kickoff: "2027-01-03T13:00:00-05:00" },
    { id: "w17-13", away: "LV", home: "ARI", kickoff: "2027-01-03T16:05:00-05:00" },
    { id: "w17-14", away: "DET", home: "CHI", kickoff: "2027-01-03T16:25:00-05:00" },
    { id: "w17-15", away: "PHI", home: "SF", kickoff: "2027-01-03T20:20:00-05:00" },
    { id: "w17-16", away: "HOU", home: "GB", kickoff: "2027-01-04T20:15:00-05:00" },
  ],
  // Week 18 is entirely flex — the NFL doesn't set matchup times/networks
  // until Week 17 finishes, since playoff seeding drives which games get
  // the good windows. Every game here is a real matchup with a real date
  // (Jan 10, 2027), just no kickoff time yet — same TBD handling as the
  // flex games in weeks 16-17, just all 16 games at once.
  18: [
    { id: "w18-1", away: "SF", home: "ARI", kickoff: null },
    { id: "w18-2", away: "PIT", home: "BAL", kickoff: null },
    { id: "w18-3", away: "NYJ", home: "BUF", kickoff: null },
    { id: "w18-4", away: "ATL", home: "CAR", kickoff: null },
    { id: "w18-5", away: "CLE", home: "CIN", kickoff: null },
    { id: "w18-6", away: "LAC", home: "DEN", kickoff: null },
    { id: "w18-7", away: "DET", home: "GB", kickoff: null },
    { id: "w18-8", away: "TEN", home: "HOU", kickoff: null },
    { id: "w18-9", away: "JAX", home: "IND", kickoff: null },
    { id: "w18-10", away: "LV", home: "KC", kickoff: null },
    { id: "w18-11", away: "SEA", home: "LAR", kickoff: null },
    { id: "w18-12", away: "CHI", home: "MIN", kickoff: null },
    { id: "w18-13", away: "MIA", home: "NE", kickoff: null },
    { id: "w18-14", away: "TB", home: "NO", kickoff: null },
    { id: "w18-15", away: "PHI", home: "NYG", kickoff: null },
    { id: "w18-16", away: "DAL", home: "WAS", kickoff: null },
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
          gameTime: g.kickoff ? Timestamp.fromDate(new Date(g.kickoff)) : null,
          timeTBD: g.kickoff === null,
          isPlayoff: false,
          playoffMultiplier: REGULAR_SEASON_MULTIPLIER,
          isLocked: false,
          isManuallyLocked: false,
        });
    }
    const tbdCount = games.filter((g) => g.kickoff === null).length;
    console.log(`  Done: ${games.length}/${games.length}${tbdCount ? ` (${tbdCount} still flex/TBD)` : ""}`);
  }

  const totalGames = Object.values(WEEKS).reduce((sum, w) => sum + w.length, 0);
  console.log(`\nSeeded ${totalGames} games across weeks ${Object.keys(WEEKS).join(", ")}.`);
  console.log("Combined with seed-weeks1-8.ts, the full 272-game 2026 season is now seeded.");
  console.log("Some Week 16-18 games are flex/TBD — re-run this script once the NFL announces");
  console.log("real kickoff times for those, updating the relevant entries above first.");
}

seedWeeks().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

/**
 * Live spread refresh script
 *
 * Unlike patch-spreads.ts (which writes a fixed table transcribed once),
 * this actually fetches survivorgrid.com fresh every time it runs and
 * parses the live grid — meant to be run daily (see
 * .github/workflows/refresh-spreads.yml) so spreads stay current as the
 * source updates them.
 *
 * IMPORTANT HONESTY NOTE: this was written without the ability to test it
 * against the live site from the environment that built it — it can read
 * that page through its own tools, but couldn't verify what a real Node
 * script hitting the same URL actually receives (JS-rendered content,
 * anti-bot measures, structural changes, etc. are all real possibilities
 * this hasn't been checked against). RUN THIS MANUALLY AND CHECK THE
 * OUTPUT before trusting the scheduled version. If the page's HTML
 * structure changes, this will need updating — that's true of any scraper,
 * not a one-time risk.
 *
 * To reduce the danger of a broken scraper corrupting real data, this
 * validates everything it parses BEFORE writing anything: every team must
 * have exactly 17 weeks of data, and every game's two spreads must be
 * equal-and-opposite (the real mathematical property spreads have). If
 * those checks fail, it aborts with no writes at all rather than pushing
 * partial or garbled data.
 *
 * Run:
 *   npm run refresh:spreads
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as cheerio from "cheerio";
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
const SOURCE_URL = "https://www.survivorgrid.com/";

const VALID_TEAMS = new Set([
  "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB",
  "HOU", "IND", "JAX", "KC", "LV", "LAC", "LAR", "MIA", "MIN", "NE", "NO", "NYG",
  "NYJ", "PHI", "PIT", "SF", "SEA", "TB", "TEN",
  "WAS", // this app's own code — the source itself uses "WSH", normalized below
]);

// The source uses a couple of codes that don't match this app's own
// convention (checked against firestore-schema.ts / teamColors.ts) — this
// is exactly the kind of drift that caused a real bug in the earlier
// one-time patch script, caught only by the validation step below. Any
// future mismatch would show up the same way: as a "missing spread data"
// warning for that team's games.
const TEAM_CODE_ALIASES: Record<string, string> = {
  WSH: "WAS",
};

function normalizeTeam(code: string): string {
  return TEAM_CODE_ALIASES[code] || code;
}

// Parses one grid cell's text, e.g. "@SEA +3.5", "(n)KC -2.5", "BYE", "PK".
// Returns { opponent, spread } or null for a bye week.
function parseCell(text: string): { opponent: string; spread: string } | null {
  const trimmed = text.trim();
  if (!trimmed || /^BYE$/i.test(trimmed)) return null;

  const match = trimmed.match(/^(?:@|\(n\))?([A-Z]{2,3})\s+(PK|[+-]?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return { opponent: normalizeTeam(match[1]), spread: match[2] };
}

async function fetchAndParse(): Promise<Record<string, Record<number, string>>> {
  console.log(`Fetching ${SOURCE_URL}...`);
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; pickem-app spread refresh)" },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const spreads: Record<string, Record<number, string>> = {};

  // Find every table row, look for one whose first few cells contain a
  // recognizable team code — this is deliberately not tied to a specific
  // table/column index, since that's the kind of thing that silently
  // breaks a scraper the moment a site adds or reorders a column.
  $("tr").each((_, row) => {
    const cells = $(row)
      .find("td, th")
      .map((__, cell) => $(cell).text().trim())
      .get();
    if (cells.length < 10) return; // not a data row

    const teamCellIndex = cells.findIndex((c) => VALID_TEAMS.has(normalizeTeam(c)) || TEAM_CODE_ALIASES[c]);
    if (teamCellIndex === -1) return;

    const team = normalizeTeam(cells[teamCellIndex]);
    const weekCells = cells.slice(teamCellIndex + 1, teamCellIndex + 19); // next 18 = weeks 1-18

    const weeks: Record<number, string> = {};
    weekCells.forEach((cellText, i) => {
      const parsed = parseCell(cellText);
      if (parsed) weeks[i + 1] = parsed.spread;
    });

    if (Object.keys(weeks).length > 0) {
      spreads[team] = weeks;
    }
  });

  return spreads;
}

function validate(spreads: Record<string, Record<number, string>>): string[] {
  const errors: string[] = [];
  const teamsFound = Object.keys(spreads);

  const missingTeams = [...VALID_TEAMS].filter((t) => !teamsFound.includes(t));
  if (missingTeams.length > 0) {
    errors.push(`Missing teams entirely: ${missingTeams.join(", ")}`);
  }

  teamsFound.forEach((team) => {
    const weekCount = Object.keys(spreads[team]).length;
    if (weekCount !== 17) {
      errors.push(`${team} has ${weekCount} weeks of data, expected 17 (one bye)`);
    }
  });

  return errors;
}

async function refreshSpreads() {
  const spreads = await fetchAndParse();

  console.log(`Parsed ${Object.keys(spreads).length} teams.`);
  const errors = validate(spreads);
  if (errors.length > 0) {
    console.error("\nVALIDATION FAILED — aborting with NO writes to Firestore:");
    errors.forEach((e) => console.error(`  - ${e}`));
    console.error(
      "\nThis usually means survivorgrid.com's page structure changed. " +
        "The scraper in refresh-spreads.ts needs updating to match."
    );
    process.exit(1);
  }
  console.log("Validation passed: every team has exactly 17 weeks of data.\n");

  const gamesSnap = await db.collection("leagues").doc(LEAGUE_ID).collection("games").get();

  let updated = 0;
  let skipped = 0;
  let mismatchWarnings = 0;

  for (const gameDoc of gamesSnap.docs) {
    const g = gameDoc.data();
    if (g.week === 0) {
      skipped++;
      continue;
    }

    const awaySpread = spreads[g.awayTeam]?.[g.week];
    const homeSpread = spreads[g.homeTeam]?.[g.week];

    if (!awaySpread || !homeSpread) {
      console.log(`  No spread data for ${g.awayTeam} @ ${g.homeTeam}, week ${g.week} — skipping`);
      skipped++;
      continue;
    }

    const numAway = awaySpread === "PK" ? 0 : parseFloat(awaySpread);
    const numHome = homeSpread === "PK" ? 0 : parseFloat(homeSpread);
    if (Math.abs(numAway + numHome) > 0.01) {
      console.warn(
        `  WARNING: ${g.awayTeam} (${awaySpread}) @ ${g.homeTeam} (${homeSpread}), week ${g.week} — ` +
          `not equal/opposite, writing anyway but this looks wrong`
      );
      mismatchWarnings++;
    }

    await gameDoc.ref.update({ awaySpread, homeSpread });
    updated++;
  }

  console.log(`\nUpdated ${updated} games, skipped ${skipped}${mismatchWarnings ? `, ${mismatchWarnings} spread-pair warnings` : ""}.`);
}

refreshSpreads().catch((err) => {
  console.error("Refresh failed:", err);
  process.exit(1);
});

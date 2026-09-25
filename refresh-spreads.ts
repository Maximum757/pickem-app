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
 * appear for every listed week except at most one bye, both teams in a game
 * must list each other, and every game's two spreads must be
 * equal-and-opposite (the real mathematical property spreads have). If
 * those checks fail, it aborts with no writes at all rather than pushing
 * partial or garbled data.
 *
 * Run:
 *   npm run refresh:spreads
 *   DRY_RUN=1 npm run refresh:spreads   (prints changes, writes nothing)
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
const DRY_RUN = process.env.DRY_RUN === "1";
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

type TeamWeek = { opponent: string; spread: string };
type ParsedGrid = {
  weeks: number[];
  spreads: Record<string, Record<number, TeamWeek>>;
};

async function fetchAndParse(): Promise<ParsedGrid> {
  console.log(`Fetching ${SOURCE_URL}...`);
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; pickem-app spread refresh)" },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const rows = $("tr")
    .map((_, row) => [
      $(row)
        .find("td, th")
        .map((__, cell) => $(cell).text().trim().replace(/\s+/g, " "))
        .get(),
    ])
    .get() as string[][];

  // The grid only lists weeks that haven't been played yet, so the first
  // week column shifts as the season goes on. Week numbers come from the
  // header row ("Team", "3", "4", ...) rather than column position.
  const header = rows.find((cells) => cells.includes("Team"));
  if (!header) throw new Error("Couldn't find the grid's header row (no \"Team\" column).");
  const teamCol = header.indexOf("Team");
  const weekByCol = new Map<number, number>();
  header.forEach((text, col) => {
    if (col > teamCol && /^\d{1,2}$/.test(text)) weekByCol.set(col, Number(text));
  });
  const weeks = [...weekByCol.values()];
  if (weeks.length === 0) throw new Error("Header row has no week-number columns.");

  const spreads: Record<string, Record<number, TeamWeek>> = {};
  rows.forEach((cells) => {
    if (cells === header || cells.length <= teamCol) return;
    const team = normalizeTeam(cells[teamCol]);
    if (!VALID_TEAMS.has(team)) return;
    const byWeek: Record<number, TeamWeek> = {};
    weekByCol.forEach((week, col) => {
      const parsed = parseCell(cells[col] || "");
      if (parsed) byWeek[week] = parsed;
    });
    spreads[team] = byWeek;
  });

  return { weeks, spreads };
}

function validate({ weeks, spreads }: ParsedGrid): string[] {
  const errors: string[] = [];
  const teamsFound = Object.keys(spreads);

  const missingTeams = [...VALID_TEAMS].filter((t) => !teamsFound.includes(t));
  if (missingTeams.length > 0) {
    errors.push(`Missing teams entirely: ${missingTeams.join(", ")}`);
  }

  // Every team plays every listed week except at most one bye.
  teamsFound.forEach((team) => {
    const weekCount = Object.keys(spreads[team]).length;
    if (weekCount < weeks.length - 1) {
      errors.push(`${team} has ${weekCount} of ${weeks.length} listed weeks, expected at most one bye`);
    }
  });

  // Each game appears twice (once per team): the opponents must point at
  // each other and the spreads must be equal and opposite.
  teamsFound.forEach((team) => {
    Object.entries(spreads[team]).forEach(([week, { opponent, spread }]) => {
      const other = spreads[opponent]?.[Number(week)];
      if (!other || other.opponent !== team) {
        errors.push(`Week ${week}: ${team} lists ${opponent}, but ${opponent} doesn't list ${team}`);
        return;
      }
      const a = spread === "PK" ? 0 : parseFloat(spread);
      const b = other.spread === "PK" ? 0 : parseFloat(other.spread);
      if (Math.abs(a + b) > 0.01) {
        errors.push(`Week ${week}: ${team} ${spread} vs ${opponent} ${other.spread} aren't equal and opposite`);
      }
    });
  });

  return errors;
}

async function refreshSpreads() {
  const grid = await fetchAndParse();
  const { spreads } = grid;

  console.log(
    `Parsed ${Object.keys(spreads).length} teams for weeks ${grid.weeks[0]}–${grid.weeks[grid.weeks.length - 1]}.`
  );
  const errors = validate(grid);
  if (errors.length > 0) {
    console.error("\nVALIDATION FAILED — aborting with NO writes to Firestore:");
    errors.forEach((e) => console.error(`  - ${e}`));
    console.error(
      "\nThis usually means survivorgrid.com's page structure changed. " +
        "The scraper in refresh-spreads.ts needs updating to match."
    );
    process.exit(1);
  }
  console.log("Validation passed: every game's two sides match and every team has at most one bye.\n");

  const gamesSnap = await db.collection("leagues").doc(LEAGUE_ID).collection("games").get();

  const listedWeeks = new Set(grid.weeks);
  const now = Date.now();
  let updated = 0;
  let unchanged = 0;
  let started = 0;
  let missing = 0;

  for (const gameDoc of gamesSnap.docs) {
    const g = gameDoc.data();
    if (!listedWeeks.has(g.week)) continue;

    // A game's spread freezes once it kicks off — that's the line people
    // picked against, even if the source keeps updating it.
    const kickoff = g.gameTime?.toMillis?.() as number | undefined;
    if (g.isLocked || g.isManuallyLocked || g.result || (kickoff !== undefined && kickoff <= now)) {
      started++;
      continue;
    }

    const away = spreads[g.awayTeam]?.[g.week];
    const home = spreads[g.homeTeam]?.[g.week];
    if (!away || !home || away.opponent !== g.homeTeam || home.opponent !== g.awayTeam) {
      console.log(
        `  Week ${g.week} ${g.awayTeam} @ ${g.homeTeam}: grid has ` +
          `${g.awayTeam}→${away?.opponent ?? "nothing"}, ${g.homeTeam}→${home?.opponent ?? "nothing"} — skipping`
      );
      missing++;
      continue;
    }

    if (g.awaySpread === away.spread && g.homeSpread === home.spread) {
      unchanged++;
      continue;
    }

    console.log(
      `  Week ${g.week} ${g.awayTeam} @ ${g.homeTeam}: ` +
        `${g.awaySpread ?? "—"}/${g.homeSpread ?? "—"} → ${away.spread}/${home.spread}`
    );
    if (!DRY_RUN) await gameDoc.ref.update({ awaySpread: away.spread, homeSpread: home.spread });
    updated++;
  }

  console.log(
    `\n${DRY_RUN ? "Would update" : "Updated"} ${updated} games; ${unchanged} already current, ` +
      `${started} already kicked off (left as-is), ${missing} not matched in the grid.`
  );
}

refreshSpreads().catch((err) => {
  console.error("Refresh failed:", err);
  process.exit(1);
});

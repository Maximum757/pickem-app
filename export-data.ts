/**
 * Backup export script
 *
 * Pulls the real, current data out of Firestore into local files you can
 * keep, email, or drop in a spreadsheet — a genuine backup independent of
 * Vercel, GitHub, or Firebase's own dashboard. Run it anytime:
 *
 *   npm run export
 *
 * Uses the same Admin SDK service account as seed-week0.ts (reads
 * FIREBASE_SERVICE_ACCOUNT_PATH from .env.local) — it's read-only here, but
 * still needs real credentials since it bypasses client security rules the
 * same way the seed script does.
 *
 * Writes to a fresh timestamped folder under ./backups/ every run, so you
 * never overwrite an earlier snapshot:
 *   backups/2026-09-05T14-30-00/standings.csv
 *   backups/2026-09-05T14-30-00/roster.csv
 *   backups/2026-09-05T14-30-00/picks-week0.csv
 *   backups/2026-09-05T14-30-00/full-export.json   (everything, unflattened)
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
  console.error(
    "Missing FIREBASE_SERVICE_ACCOUNT_PATH. Set it in .env.local — see WEEK0_SETUP.md."
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

function toCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (val: any) => {
    const s = val === null || val === undefined ? "" : String(val);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  });
  return lines.join("\n");
}

// Firestore Timestamps don't survive JSON.stringify meaningfully — convert
// them to plain ISO strings so the JSON export is actually readable, not
// full of {_seconds, _nanoseconds} objects.
function serialize(value: any): any {
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    Object.keys(value).forEach((k) => (out[k] = serialize(value[k])));
    return out;
  }
  return value;
}

async function exportBackup() {
  const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
  const outDir = path.resolve(process.cwd(), "backups", timestamp);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Exporting league "${LEAGUE_ID}" to ${outDir}...`);

  const leagueSnap = await db.collection("leagues").doc(LEAGUE_ID).get();
  const league = serialize(leagueSnap.data());
  const season = league?.season ?? new Date().getFullYear();

  const playersSnap = await db.collection(`leagues/${LEAGUE_ID}/players`).get();
  const players = playersSnap.docs.map((d) => serialize(d.data()));

  const gamesSnap = await db.collection(`leagues/${LEAGUE_ID}/games`).get();
  const games = gamesSnap.docs.map((d) => serialize(d.data()));

  const picksSnap = await db.collection(`leagues/${LEAGUE_ID}/picks`).get();
  const picks = picksSnap.docs.map((d) => serialize(d.data()));

  const standingsSnap = await db.collection(`leagues/${LEAGUE_ID}/standings`).doc(String(season)).get();
  const standings = serialize(standingsSnap.data());

  // standings.csv — the one most people actually want to keep
  if (standings?.standings?.length) {
    const csv = toCsv(
      standings.standings.map((s: any) => ({
        rank: s.rank,
        player: s.playerName,
        totalPoints: s.totalPoints,
        totalCorrect: s.totalCorrect,
        highestWeek: s.highestWeek,
        secondHighestWeek: s.secondHighestWeek,
      }))
    );
    fs.writeFileSync(path.join(outDir, "standings.csv"), csv);
    console.log(`  standings.csv — ${standings.standings.length} players`);
  } else {
    console.log("  (no standings yet — skipping standings.csv)");
  }

  // roster.csv
  const rosterCsv = toCsv(
    players.map((p: any) => ({
      name: p.name,
      email: p.email,
      isCommissioner: p.isCommissioner,
      joinedAt: p.joinedAt,
    }))
  );
  fs.writeFileSync(path.join(outDir, "roster.csv"), rosterCsv);
  console.log(`  roster.csv — ${players.length} players`);

  // one picks-weekN.csv per week that has any picks
  const weeksWithPicks = Array.from(new Set(picks.map((p: any) => p.week))).sort(
    (a: any, b: any) => a - b
  );
  weeksWithPicks.forEach((week: any) => {
    const weekPicks = picks.filter((p: any) => p.week === week);
    const playerNameById: Record<string, string> = {};
    players.forEach((p: any) => (playerNameById[p.id] = p.name));
    const gameLabelById: Record<string, string> = {};
    games.forEach((g: any) => (gameLabelById[g.id] = `${g.awayTeam} @ ${g.homeTeam}`));

    const csv = toCsv(
      weekPicks.map((p: any) => ({
        player: playerNameById[p.playerId] || p.playerId,
        game: gameLabelById[p.gameId] || p.gameId,
        pickedTeam: p.pickedTeam,
        isCorrect: p.isCorrect,
        pointsAwarded: p.pointsAwarded,
      }))
    );
    fs.writeFileSync(path.join(outDir, `picks-week${week}.csv`), csv);
    console.log(`  picks-week${week}.csv — ${weekPicks.length} picks`);
  });

  // full-export.json — everything, unflattened, for a true full backup
  fs.writeFileSync(
    path.join(outDir, "full-export.json"),
    JSON.stringify({ league, players, games, picks, standings }, null, 2)
  );
  console.log(`  full-export.json — complete raw backup`);

  console.log(`\nDone. Backup saved to: ${outDir}`);
}

exportBackup().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});

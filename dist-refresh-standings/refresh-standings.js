"use strict";
/**
 * One-time standings refresh
 *
 * recalculateSeasonStandings() only ever runs as a side effect of scoring
 * a game — the cached standings doc otherwise just sits there. Week 0's
 * points are now excluded from the calculation (see the fix in
 * firebase-utils.ts), but that fix doesn't retroactively touch the doc
 * that's already been written — it's still holding whatever totals were
 * last computed, which almost certainly include Week 0's test points.
 * This forces one fresh recalculation right now, rather than leaving
 * standings visibly wrong until the next real result happens to trigger it.
 *
 * Run:
 *   npm run refresh:standings
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const path = __importStar(require("path"));
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
if (!serviceAccountPath) {
    console.error("Missing FIREBASE_SERVICE_ACCOUNT_PATH. See WEEK0_SETUP.md.");
    process.exit(1);
}
const resolvedServiceAccountPath = path.resolve(process.cwd(), serviceAccountPath);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require(resolvedServiceAccountPath);
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)({ credential: (0, app_1.cert)(serviceAccount) });
}
const db = (0, firestore_1.getFirestore)();
const LEAGUE_ID = process.env.REACT_APP_LEAGUE_ID || "week0-test-league";
async function refreshStandings() {
    const leagueRef = db.collection("leagues").doc(LEAGUE_ID);
    const leagueSnap = await leagueRef.get();
    if (!leagueSnap.exists) {
        console.error("League not found.");
        process.exit(1);
    }
    const league = leagueSnap.data();
    const season = league.season;
    const playersSnap = await leagueRef.collection("players").get();
    const players = playersSnap.docs.map((d) => d.data());
    const playerStats = new Map();
    players.forEach((p) => playerStats.set(p.id, { totalPoints: 0, totalCorrect: 0, name: p.name }));
    for (const player of players) {
        const picksSnap = await leagueRef.collection("picks").where("playerId", "==", player.id).get();
        picksSnap.docs.forEach((d) => {
            const pick = d.data();
            if (pick.week === 0)
                return; // Week 0 test data — excluded from real standings
            const stats = playerStats.get(player.id);
            if (stats && pick.pointsAwarded !== undefined) {
                stats.totalPoints += pick.pointsAwarded;
                if (pick.isCorrect)
                    stats.totalCorrect += 1;
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
        highestWeek: null,
        secondHighestWeek: null,
    }))
        .sort((a, b) => b.totalPoints - a.totalPoints || b.totalCorrect - a.totalCorrect);
    standings.forEach((s, i) => (s.rank = i + 1));
    await leagueRef.collection("standings").doc(String(season)).set({
        leagueId: LEAGUE_ID,
        season,
        standings,
        updatedAt: firestore_1.Timestamp.now(),
    });
    console.log(`Standings refreshed for ${standings.length} players, Week 0 excluded.`);
    standings.forEach((s) => console.log(`  ${s.rank}. ${s.playerName} — ${s.totalPoints} pts, ${s.totalCorrect} correct`));
}
refreshStandings().catch((err) => {
    console.error("Refresh failed:", err);
    process.exit(1);
});

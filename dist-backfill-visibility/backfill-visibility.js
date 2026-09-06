"use strict";
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
async function backfill() {
    const leagueRef = db.collection("leagues").doc(LEAGUE_ID);
    // Part 1: every already-locked game's picks.
    const gamesSnap = await leagueRef.collection("games").where("isLocked", "==", true).get();
    console.log(`Found ${gamesSnap.size} already-locked games.`);
    let pickCount = 0;
    for (const gameDoc of gamesSnap.docs) {
        const g = gameDoc.data();
        const picksSnap = await leagueRef.collection("picks").where("gameId", "==", gameDoc.id).get();
        if (picksSnap.empty)
            continue;
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
            if (picksSnap.empty)
                continue;
            const batch = db.batch();
            picksSnap.docs.forEach((pickDoc) => {
                batch.update(pickDoc.ref, { visibleToAll: true });
            });
            await batch.commit();
            commissionerPickCount += picksSnap.size;
            console.log(`  Week ${week}: ${picksSnap.size} commissioner picks marked visible`);
        }
    }
    console.log(`\nDone. ${pickCount} picks marked visible from locked games, ${commissionerPickCount} from locked commissioner weeks.`);
}
backfill().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
});

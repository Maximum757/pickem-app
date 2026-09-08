"use strict";
/**
 * One-time patch: Week 0 kickoff time fix
 *
 * ALL 16 Week 0 games were entered 4 hours too late in the original seed —
 * not just the last 4 (which is what first got reported: the other 12 had
 * already kicked off by the time this was noticed, so the wrong stored
 * time and the correct one both looked identical — "already locked" —
 * making the error invisible until we hit games close enough to "now"
 * for the 4-hour gap to actually matter). A genuine data-entry mistake in
 * the original file, not a timezone-handling bug — the ISO offsets
 * themselves were always well-formed.
 *
 * This only updates gameTime — deliberately NOT a full reseed, which would
 * overwrite isLocked/result/pick-count fields on games that have already
 * been tested against. Safe to run regardless of what state any of these
 * 16 games are currently in.
 *
 * Run:
 *   npm run patch:week0-times
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
// Every value below is the original wrong time minus exactly 4 hours,
// computed programmatically (not by hand) to correctly handle the one
// game (w0-12) that rolls back across a day boundary once corrected.
const FIXES = [
    { id: "w0-1", correctKickoff: "2026-09-05T12:00:00-04:00" }, // North Texas @ Indiana
    { id: "w0-2", correctKickoff: "2026-09-05T12:00:00-04:00" }, // East Carolina @ Alabama
    { id: "w0-3", correctKickoff: "2026-09-05T12:30:00-04:00" }, // Ball State @ Ohio State
    { id: "w0-4", correctKickoff: "2026-09-05T15:00:00-04:00" }, // Tennessee State @ Georgia
    { id: "w0-5", correctKickoff: "2026-09-05T15:30:00-04:00" }, // Baylor @ Auburn
    { id: "w0-6", correctKickoff: "2026-09-05T15:30:00-04:00" }, // Boise State @ Oregon
    { id: "w0-7", correctKickoff: "2026-09-05T15:30:00-04:00" }, // Texas State @ Texas
    { id: "w0-8", correctKickoff: "2026-09-05T15:30:00-04:00" }, // Tulane @ Duke
    { id: "w0-9", correctKickoff: "2026-09-05T19:30:00-04:00" }, // Clemson @ LSU
    { id: "w0-10", correctKickoff: "2026-09-05T19:30:00-04:00" }, // Western Michigan @ Michigan
    { id: "w0-11", correctKickoff: "2026-09-05T19:45:00-04:00" }, // Florida Atlantic @ Florida
    { id: "w0-12", correctKickoff: "2026-09-05T22:30:00-04:00" }, // UCLA @ California
    { id: "w0-13", correctKickoff: "2026-09-06T16:00:00-04:00" }, // Washington State @ Washington
    { id: "w0-14", correctKickoff: "2026-09-06T19:30:00-04:00" }, // Louisville @ Ole Miss
    { id: "w0-15", correctKickoff: "2026-09-06T19:30:00-04:00" }, // Wisconsin @ Notre Dame
    { id: "w0-16", correctKickoff: "2026-09-07T19:30:00-04:00" }, // SMU @ Florida State
];
async function patchWeek0Times() {
    for (const fix of FIXES) {
        const gameRef = db.collection("leagues").doc(LEAGUE_ID).collection("games").doc(fix.id);
        const snap = await gameRef.get();
        if (!snap.exists) {
            console.log(`  ${fix.id}: not found, skipping`);
            continue;
        }
        const g = snap.data();
        await gameRef.update({ gameTime: firestore_1.Timestamp.fromDate(new Date(fix.correctKickoff)) });
        console.log(`  ${fix.id} (${g.awayTeam} @ ${g.homeTeam}): gameTime corrected to ${fix.correctKickoff}`);
    }
    console.log("\nDone. isLocked/result on these games were left untouched.");
}
patchWeek0Times().catch((err) => {
    console.error("Patch failed:", err);
    process.exit(1);
});

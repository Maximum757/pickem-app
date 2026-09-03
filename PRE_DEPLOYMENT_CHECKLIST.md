# Pre-Deployment Checklist

Use this checklist to verify everything works before going live.

---

## ✓ Engine Verification (5 min)

- [ ] Run `npm run test` 
- [ ] Verify output: "✓ ALL INVARIANTS PASSED ACROSS ALL SIMULATIONS"
- [ ] Check sample standings output (should show 25 players, realistic points)

**If test fails:**
- Check `pick-em-engine.ts` for type errors
- Verify TypeScript compilation: `npx tsc`
- Check Node.js version (16+)

---

## ✓ Local Dev Environment (10 min)

- [ ] Create `.env.local` with Firebase config
- [ ] Run `npm install`
- [ ] Run `npm run dev`
- [ ] App opens at http://localhost:3000
- [ ] No console errors (F12 to check)

**If app doesn't start:**
- Check `.env.local` has all Firebase values
- Verify Firebase config is valid (copy-paste from Firebase Console)
- Check Vite build output in terminal

---

## ✓ Firebase Setup (15 min)

- [ ] Firebase project created (https://console.firebase.google.com)
- [ ] Firestore Database enabled
- [ ] Collections created:
  - [ ] leagues/{leagueId}
  - [ ] leagues/{leagueId}/players
  - [ ] leagues/{leagueId}/games
  - [ ] leagues/{leagueId}/picks
  - [ ] leagues/{leagueId}/weeklyTiebreakers
  - [ ] leagues/{leagueId}/standings
  - [ ] leagues/{leagueId}/weeklyScores
- [ ] Security rules updated (see README.md)
- [ ] Test document created:
  - [ ] leagues/test-league → {name: "Test", season: 2025}

**If Firestore rules rejected:**
- Make sure auth is enabled (Firebase Console → Authentication)
- Firestore rules must allow authenticated read/write
- Test with `REACT_APP_LEAGUE_ID=test-league`

---

## ✓ Leagues & Players Loaded (10 min)

- [ ] Sample league created in Firestore
- [ ] At least 3 sample players added
- [ ] Sample games added (8-10 games for week 1)
- [ ] Commissioner ID set correctly in league doc

**If picks don't show:**
- Verify games exist in Firestore
- Check gameTime is in correct format (ISO 8601)
- Verify playerId matches authenticated user

---

## ✓ UI Components Working (10 min)

- [ ] PicksScreen loads (My Picks tab)
  - [ ] Games display with team names
  - [ ] Can click team buttons to select
  - [ ] Submit button appears when all games picked
- [ ] StandingsScreen loads (Standings tab)
  - [ ] Player list displays with scores
  - [ ] Sorted by rank correctly
- [ ] CommissionerDashboard loads (Commissioner tab)
  - [ ] Can select game from dropdown
  - [ ] Can enter scores
  - [ ] Can set tiebreaker
  - [ ] Score Week button visible

**If components don't render:**
- Check browser console for React errors
- Verify LeagueContext provider wraps App
- Check Firebase data is loading (network tab)

---

## ✓ Data Flow (10 min)

- [ ] Submit picks:
  - [ ] Click team buttons
  - [ ] Click "Submit Picks"
  - [ ] Check Firestore: picks/{playerId_gameId} document created
  - [ ] Verify `submittedAt` timestamp
- [ ] Enter game result:
  - [ ] Select game in commissioner dashboard
  - [ ] Pick winner and enter scores
  - [ ] Check Firestore: game.result populated
  - [ ] Verify game.isLocked = true
- [ ] Score week:
  - [ ] Click "Score Week {N}"
  - [ ] Check Firestore: weeklyScores/{week} document created
  - [ ] Check standings/{season} updated
  - [ ] Verify player points calculated correctly

**If data not persisting:**
- Check browser → Network tab for failed Firestore calls
- Verify Firebase config is correct
- Check Firestore security rules allow writes
- Confirm `submittedAt`, `enteredAt` are Timestamp, not Date

---

## ✓ Scoring Logic (10 min)

Create a test scenario:
- [ ] 3 players, 2 games in week 1
- [ ] Game 1: 2 pick KC, 1 picks LAC (KC wins)
  - Expected: 2 KC pickers each score 1 point
- [ ] Game 2: 2 pick TB, 1 picks NO (TB wins)
  - Expected: 2 TB pickers each score 1 point
- [ ] After scoring:
  - [ ] Standings: KC pickers = 1 pt, TB pickers = 1 pt
  - [ ] All players visible in standings
  - [ ] Rank assigned correctly

**If scoring is wrong:**
- Check `pick-em-engine.ts` scoreGame() logic
- Verify game results match what you entered
- Run simulation: `npm run test` (should still pass)

---

## ✓ Tiebreaker Logic (5 min)

- [ ] Set a weekly tiebreaker:
  - Question: "KC total score"
  - Answer: 28
  - Rule: "closest"
- [ ] Verify in Firestore: weeklyTiebreakers/{week} created
- [ ] UI shows tiebreaker on PicksScreen (optional, for future)

---

## ✓ Multi-User Testing (10 min)

- [ ] Open app in two browser windows/tabs
- [ ] Player 1: Submit picks for week 1
- [ ] Player 2: Submit different picks
- [ ] Commissioner: Enter game results
- [ ] Both players: Refresh and check standings update
- [ ] Both see same standings

**If multi-user sync fails:**
- Check Firestore Rules (must allow authenticated reads)
- Verify real-time listeners working (check console)
- Test with private browsing tabs (different users)

---

## ✓ Deployment Prep (5 min)

- [ ] Rename `package-web.json` → `package.json`
- [ ] Create GitHub repo
- [ ] Push all files to GitHub
- [ ] Create Vercel account (https://vercel.com)
- [ ] Connect GitHub to Vercel
- [ ] Add environment variables in Vercel settings:
  - [ ] REACT_APP_FIREBASE_API_KEY
  - [ ] REACT_APP_FIREBASE_AUTH_DOMAIN
  - [ ] REACT_APP_FIREBASE_PROJECT_ID
  - [ ] REACT_APP_FIREBASE_STORAGE_BUCKET
  - [ ] REACT_APP_FIREBASE_MESSAGING_SENDER_ID
  - [ ] REACT_APP_FIREBASE_APP_ID

---

## ✓ Production Deployment (5 min)

- [ ] Build locally: `npm run build`
- [ ] Verify dist/ folder has index.html and files
- [ ] Push to GitHub
- [ ] Vercel auto-builds and deploys
- [ ] App live at `<your-project>.vercel.app`
- [ ] Test production app with same Firebase
- [ ] Verify picks/standings work in production

**If production build fails:**
- Check Vercel build logs
- Verify `package.json` has correct build command: `tsc && vite build`
- Check .env.local not committed (use .env.example)

---

## ✓ Week 1 Launch (next Sunday)

- [ ] League created with all 25 players
- [ ] Week 1 games loaded in Firestore
- [ ] All players have access to app
- [ ] Can submit picks before game locks
- [ ] Commissioner can enter results as games complete
- [ ] Commissioner scores the week after all games final
- [ ] Standings calculate correctly

---

## ✓ Ongoing Operations

After deployment, each week:
- [ ] Games locked at kickoff (auto or manual)
- [ ] Players submit picks before locktime
- [ ] Commissioner monitors for missed picks (if wildcard needed)
- [ ] Commissioner enters results as games complete
- [ ] Commissioner sets tiebreaker (if needed)
- [ ] Commissioner scores week after all games final
- [ ] Check standings update correctly
- [ ] Announce results to league

---

## Common Issues & Fixes

**"Cannot find module firebase"**
- Run `npm install firebase`

**"Firestore permission denied"**
- Check rules allow authenticated users
- Verify Firebase auth domain matches

**"Games not showing"**
- Verify games exist in Firestore
- Check week number matches
- Ensure `gameTime` is ISO 8601 format

**"Picks not saving"**
- Check Firestore rules allow writes
- Verify playerId in context matches document
- Check browser console for errors

**"Standings not updating after scoring"**
- Refresh browser (Ctrl+R)
- Check Firestore standings/{season} updated
- Verify all games have results before scoring

---

## Success Criteria

✓ **Engine:** 100-season simulation passes, 0 warnings
✓ **Local:** npm run dev opens app at http://localhost:3000
✓ **Firebase:** Collections created, security rules set
✓ **UI:** All three tabs work (picks, standings, commissioner)
✓ **Data Flow:** Picks save, results recorded, standings update
✓ **Scoring:** Points calculated correctly per contrarian rules
✓ **Deployment:** Build succeeds, Vercel deployment passes
✓ **Production:** App live, Firebase syncs correctly

---

**Estimated time to completion: 45 minutes**

Once all checkboxes are ✓, you're ready to go live for Week 1.

Good luck!

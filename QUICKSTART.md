# Quick Start Guide

Get the contrarian pick 'em app running in 15 minutes.

## Step 1: Firebase Setup (2 min)

1. Go to https://console.firebase.google.com
2. Create new project or use existing
3. Click Settings (gear icon) → Project Settings
4. Copy your config values (API Key, Auth Domain, Project ID, etc.)
5. Save these — you'll need them in Step 3

## Step 2: Clone & Install (3 min)

```bash
git clone <your-repo>
cd pick-em
npm install
```

## Step 3: Environment Variables (2 min)

1. Create `.env.local` in project root
2. Copy values from Firebase into it:

```env
REACT_APP_FIREBASE_API_KEY=xxx
REACT_APP_FIREBASE_AUTH_DOMAIN=xxx
REACT_APP_FIREBASE_PROJECT_ID=xxx
REACT_APP_FIREBASE_STORAGE_BUCKET=xxx
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=xxx
REACT_APP_FIREBASE_APP_ID=xxx
```

3. Optional: set league and player IDs (or leave blank for now):
```env
REACT_APP_LEAGUE_ID=your-league-123
REACT_APP_PLAYER_ID=player-1
```

## Step 4: Create Firestore Collections (3 min)

In Firebase Console, go to Firestore Database and create these collections:

```
leagues/{leagueId}/
  players/
  games/
  picks/
  weeklyTiebreakers/
  standings/
  weeklyScores/
```

(You don't need to add any documents yet — just create the collections)

## Step 5: Run Locally (2 min)

```bash
npm run dev
```

App opens at http://localhost:3000

## Step 6: Test the Scoring Engine (optional)

```bash
npm run test
```

Should show: ✓ ALL INVARIANTS PASSED ACROSS ALL SIMULATIONS

---

## Next: Add Real Data

To actually use the app:

1. Create a league document in Firestore:
   ```
   /leagues/my-league-2025 → {
     name: "2025 Pick 'Em",
     season: 2025,
     commissionerId: "max",
     playerCount: 25
   }
   ```

2. Add players:
   ```
   /leagues/my-league-2025/players/p1 → { name: "Max", email: "..." }
   /leagues/my-league-2025/players/p2 → { name: "John", email: "..." }
   ... etc
   ```

3. Add games (or use admin script to bulk-load NFL schedule)

4. Start using the app!

---

## Deploy to Vercel (1 click)

1. Push to GitHub
2. Go to https://vercel.com/new
3. Import your repo
4. Add same environment variables
5. Deploy

That's it. Your app is live.

---

## Troubleshooting

**App doesn't start:**
- Check `.env.local` has correct Firebase config
- Check console for error messages

**Can't see games/picks:**
- Check Firebase Firestore has the collections
- Check browser console (F12) for API errors

**Need to populate games?**
- Bulk-import an NFL schedule JSON into Firestore
- (Future: admin CLI tool to auto-fetch from ESPN)

---

Next steps: Configure your actual league data and you're ready to go!

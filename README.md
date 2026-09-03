# Contrarian Pick 'Em Web App

Framework-free scoring engine + React + Firebase + Vercel deployment.

## Architecture

**Three layers:**

1. **Scoring Engine** (`pick-em-engine.ts`)
   - Pure TypeScript, no frameworks
   - Contrarian payout logic
   - Tiebreaker resolution
   - Season standings calculation
   - Fully tested with simulation harness (100 seasons, 0 invariant failures)

2. **Data Layer** (`firestore-schema.ts`, `firebase-utils.ts`)
   - Firestore collections and schema
   - Batch write operations
   - Transaction helpers for complex operations

3. **UI** (`components.tsx`, `LeagueContext.tsx`)
   - React components for pick entry, standings, commissioner dashboard
   - Tailwind CSS styling
   - Context-based state management

## Setup

### Prerequisites

- Node.js 16+
- Firebase project (create one at https://console.firebase.google.com)
- Vercel account (https://vercel.com)

### Local Development

1. Clone and install:
```bash
git clone <repo>
cd pick-em
npm install
```

2. Create `.env.local`:
```env
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_auth_domain
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_storage_bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id

REACT_APP_LEAGUE_ID=your-league-id
REACT_APP_PLAYER_ID=your-player-id
```

3. Run locally (with Vite or Create React App):
```bash
npm run dev
```

### Firestore Setup

In Firebase Console, create these collections:

```
/leagues/{leagueId}/
  ├── players/{playerId}
  ├── games/{gameId}
  ├── picks/{pickId}
  ├── weeklyTiebreakers/{week}
  ├── standings/{season}
  └── weeklyScores/{week}
```

Security rules (update project IDs):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leagues/{leagueId} {
      allow read: if request.auth != null;
      match /players/{playerId} {
        allow read: if request.auth != null;
      }
      match /games/{gameId} {
        allow read: if request.auth != null;
      }
      match /picks/{pickId} {
        allow read, write: if request.auth != null;
      }
      match /weeklyTiebreakers/{week} {
        allow read: if request.auth != null;
        allow write: if request.auth.uid == get(/databases/$(database)/documents/leagues/$(leagueId)).data.commissionerId;
      }
      match /standings/{season} {
        allow read: if request.auth != null;
      }
      match /weeklyScores/{week} {
        allow read: if request.auth != null;
      }
    }
  }
}
```

## Scoring Logic

### Contrarian Payout

For each game:
- Count picks per team: `homeTeamPicks`, `awayTeamPicks`
- Winner: minority team (smallest pick count)
- Points per correct picker: count of incorrect pickers
- Playoff multiplier applied: 1x (regular), 1.25x/1.5x/2x (playoffs)

Example: 
- 17 pick Team A, 8 pick Team B
- Team B wins → each B picker scores 17 points
- Team A wins → each A picker scores 8 points

### Season Standings

Ranked by:
1. Total points (descending)
2. Total correct picks (descending)
3. Highest single week (descending)
4. Second-highest single week (descending)

### Weekly Tiebreaker

Commissioner enters for each week:
- Question (text): e.g., "Mahomes passing yards"
- Answer (number): e.g., 287
- Rule: "closest" or "closest_without_going_over" (Price Is Right)

If two players tie on points, tiebreaker ranks them by proximity to answer.

## API / Admin Operations

### Commissioner Dashboard

1. **Enter Game Results**
   - Select game, pick winner, enter scores
   - Locks game and stores result

2. **Set Weekly Tiebreaker**
   - Enter question, answer, rule
   - Stored in `weeklyTiebreakers/{week}`

3. **Score Week**
   - Runs scoring engine for all picks/results
   - Updates picks with points
   - Recalculates season standings

### Player Pick Submission

1. Visit `/week/{week}` or navigate to "My Picks"
2. Select team for each game
3. Submit before game locktime
4. Locked games show final result instead of buttons

## Deployment to Vercel

1. Push to GitHub:
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. Connect to Vercel:
   - Visit https://vercel.com/new
   - Select "Import Git Repository"
   - Choose your repo
   - Click "Import"

3. Set environment variables in Vercel:
   - Go to Settings → Environment Variables
   - Add all `REACT_APP_*` values from `.env.local`

4. Deploy:
   - Vercel auto-deploys on push to main
   - Or click "Deploy" in dashboard

Your app is now live at `your-project.vercel.app`

## Extending the Engine

### Phase 2: Auto-Tiebreaker Resolution

For tiebreakers tied to real game stats (e.g., "total score", "passing yards"):
1. Add NFL API integration (ESPN, official NFL)
2. Map tiebreaker questions to stat lookups
3. Auto-resolve on game completion
4. Commissioner only enters non-automatable tiebreakers

### Phase 3: Wildcard Picker Auto-Fill

Currently, missed picks are manually filled by youngest son. Future:
1. Run nightly job to detect incomplete pick submissions
2. Auto-fill with random team selection
3. Mark as `isWildcard: true`

## Data Model Diagram

```
League (metadata)
├── Player 1 (roster)
│   └── Pick 1 → Game 1, Team A
│   └── Pick 2 → Game 2, Team B
│   └── ...
├── Player 2
│   └── Pick 1 → Game 1, Team B
│   └── ...
├── Game 1 (schedule)
│   └── Result: Team B wins 24-21
├── Game 2
│   └── Result: ...
├── WeeklyTiebreaker Week 1
│   └── Question: "Total score", Answer: 52, Rule: "closest"
├── WeeklyScores Week 1
│   └── Player 1: 17 pts, 1 correct
│   └── Player 2: 8 pts, 2 correct
│   └── ...
└── Standings (cached after scoring)
    └── Rank 1: Player X, 1200 pts
    └── Rank 2: Player Y, 1150 pts
    └── ...
```

## File Structure

```
pick-em/
├── pick-em-engine.ts          # Core scoring logic (framework-free)
├── pick-em-simulation.ts      # Harness + 100-season tests
├── firestore-schema.ts        # Firestore types + queries
├── firebase-utils.ts          # Firestore CRUD + batch ops
├── LeagueContext.tsx          # React context + hooks
├── components.tsx             # React components (Picks, Standings, Commissioner)
├── index.tsx                  # App entry point
├── index.css                  # Tailwind styles
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
└── README.md                  # This file
```

## Testing

Run 100 simulated seasons to verify scoring engine:
```bash
npm run test
```

Expected output:
```
CONTRARIAN PICK 'EM ENGINE SIMULATION (100 seasons, 25 players)
✓ ALL INVARIANTS PASSED ACROSS ALL SIMULATIONS
```

## Troubleshooting

### Picks not saving
- Check Firebase Firestore rules (allow write for authenticated users)
- Verify Firebase config in `.env.local`
- Check browser console for errors

### Games not locking at kickoff
- Implement client-side game lock check (compare current time to `gameTime`)
- Backend: Cloud Function to auto-lock games (future enhancement)

### Standings not updating
- Ensure all games for week have results
- Click "Score Week" in Commissioner Dashboard
- Check Firestore `weeklyScores/{week}` collection

## Support

For issues with the scoring engine, check `pick-em-simulation.ts` output.
For Firebase issues, see Firebase Console Firestore tab.
For deployment issues, check Vercel build logs.

---

Built with simplicity and testability in mind. Core engine is pure TypeScript with zero external dependencies (beyond TypeScript itself). UI layer uses React + Tailwind for rapid iteration. Data persists in Firestore. Deploys to Vercel in one click.

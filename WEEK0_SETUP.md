# Week 0 Test — Setup Steps

Everything code-side is built. These steps are the ones only you can do —
they require your own Firebase/Vercel accounts, which I have no access to.

## 1. Firebase project (10 min)

1. https://console.firebase.google.com → Create project (or reuse one if you
   already made one earlier).
2. Build → Authentication → Get started → enable **Email/Password** as a
   sign-in method. (This is the one manual toggle the whole auth system
   depends on — nothing works until it's on.)
3. Build → Firestore Database → Create database → production mode.
4. Project Settings → General → scroll to "Your apps" → add a Web app → copy
   the config values into `.env.local` (see `.env.example`).

## 2. Deploy security rules (5 min)

```bash
npm install -g firebase-tools   # if you don't have it
firebase login
firebase init firestore         # point it at the project from step 1
# when it asks for a rules file, point it at firestore.rules from this project
firebase deploy --only firestore:rules
```

This is what actually enforces pick privacy — the rules file has to be live
in your project or the security is UI-only.

## 3. Seed Week 0 games (2 min)

```bash
npm install
npx ts-node seed-week0.ts
```

Writes all 16 games into Firestore. Safe to re-run.

## 4. Make yourself commissioner (2 min)

Sign up through the app once (creates your player doc + auth account), then
in the Firebase Console → Firestore → `leagues/week0-test-league` → set the
`commissionerId` field to your own auth uid (Console → Authentication → your
row → the uid string). Without this step the commissioner screens will be
invisible to you — `isCommissioner` is derived from this match.

## 5. Deploy to Vercel (10 min)

1. Push this repo to GitHub.
2. https://vercel.com/new → import the repo.
3. Add the same env vars from `.env.local` in Vercel's project settings.
4. Deploy. You'll get a `*.vercel.app` URL.

## 6. Invite testers

Send the Vercel URL to whoever's testing. They hit "Sign up," pick a display
name, and they're in — no invite code needed for Week 0 since it's a single
fixed test league.

## What's real vs. what's still mockup

**Real, working code:** auth (sign up/in), security rules, schedule
reordering, the scoring engine, Week 0 seed data.

**Still the plain/unstyled version, not yet ported from the Visualizer
mockups:** the actual look of the picks screen (team colors, gold/green/red
pick borders, the VS/lock/points circle indicator) and the commissioner hub's
per-game pick-count/copy-contacts view. Those were approved in the chat
widget but haven't been rebuilt as real components yet — right now
`PicksScreen` and `CommissionerDashboard` in `components.tsx` are the plainer
versions from before that design work happened. Worth flagging clearly:
what you'll see Thursday will function correctly but look more basic than
what we designed together, unless we port the visual layer before then too.

import React, { useEffect } from "react";
import { useAuth } from "./AuthContext";
import { AuthScreen } from "./AuthScreen";
import { LeagueProvider, useLeague } from "./LeagueContext";
import { App } from "./components";
import { db } from "./firebase-utils";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";

const WEEK0_LEAGUE_ID = "week0-test-league";

export function AuthGate() {
  const { user, authLoading } = useAuth();

  if (authLoading) {
    return <div className="p-4 text-gray-600">Loading...</div>;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <LeagueProvider>
      <SignedInApp uid={user.uid} email={user.email} displayName={user.displayName} />
    </LeagueProvider>
  );
}

// Pushes the authenticated uid into LeagueContext as playerId — this is the
// one place playerId gets set now. Nothing else in the app can set it, which
// is what stops someone from viewing another player's screen by editing state.
function SignedInApp({
  uid,
  email,
  displayName,
}: {
  uid: string;
  email: string | null;
  displayName: string | null;
}) {
  const { setLeagueId, setPlayerId } = useLeague();

  useEffect(() => {
    setLeagueId(WEEK0_LEAGUE_ID);
    setPlayerId(uid);
    ensurePlayerDoc(uid, email, displayName);
  }, [uid]);

  return <App />;
}

// Self-healing: creates a player doc for this user if one doesn't already
// exist, rather than only ever creating it at signup. An earlier version of
// firestore.rules made signup's own player-doc write fail for every new
// user (create was gated behind already-being-commissioner) — anyone who
// signed up under that rule has a valid auth account but no player record.
// This repairs that on next load without needing everyone to re-signup.
// Only writes when the doc is genuinely missing, so it never overwrites a
// name someone's since customized via the Hub screen.
async function ensurePlayerDoc(uid: string, email: string | null, displayName: string | null) {
  const playerRef = doc(db, `leagues/${WEEK0_LEAGUE_ID}/players`, uid);
  const snap = await getDoc(playerRef);
  if (snap.exists()) return;

  await setDoc(playerRef, {
    id: uid,
    leagueId: WEEK0_LEAGUE_ID,
    name: displayName || email || "Player",
    email: email || "",
    isCommissioner: false,
    joinedAt: Timestamp.now(),
    isWildcardPicker: false,
  });
}

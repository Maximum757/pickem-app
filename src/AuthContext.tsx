/**
 * Auth Context
 *
 * This is what makes "nobody else can see your picks" actually true, not just
 * a UI convention. Firestore security rules (firestore.rules) check
 * request.auth.uid against pick/player doc ids — so the player doc's id is
 * set to match the Firebase Auth uid at signup, and everything downstream
 * (LeagueContext's playerId) comes from the authenticated user, never from a
 * URL param or a dropdown someone could edit.
 *
 * Using email/password rather than email-link sign-in for the Week 0 test —
 * email-link requires configuring authorized domains in the Firebase console
 * per-deploy, which is one more manual step under time pressure. Password
 * auth works immediately once Email/Password is enabled in the console (see
 * WEEK0_SETUP.md). Can swap to email-link or Google sign-in later without
 * touching the security rules, since those only check request.auth.uid.
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import { doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "./firebase-utils";

interface AuthContextType {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  signUp: (email: string, password: string, displayName: string, leagueId: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  const signUp = async (email: string, password: string, displayName: string, leagueId: string) => {
    setAuthError(null);
    try {
      const auth = getAuth();
      const credential = await createUserWithEmailAndPassword(auth, email, password);

      // Player doc id === auth uid — this is the field security rules check.
      // Getting this wrong (e.g. using a random id) would silently break every
      // privacy rule in firestore.rules, so it happens here, at signup, once.
      const playerRef = doc(db, `leagues/${leagueId}/players`, credential.user.uid);
      await setDoc(playerRef, {
        id: credential.user.uid,
        leagueId,
        name: displayName,
        email,
        isCommissioner: false,
        joinedAt: Timestamp.now(),
        isWildcardPicker: false,
      });
    } catch (err: any) {
      setAuthError(readableAuthError(err));
      throw err;
    }
  };

  const signIn = async (email: string, password: string) => {
    setAuthError(null);
    try {
      const auth = getAuth();
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setAuthError(readableAuthError(err));
      throw err;
    }
  };

  const signOut = async () => {
    const auth = getAuth();
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, authLoading, authError, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

// Firebase's raw error codes ("auth/email-already-in-use") aren't something
// to show a tester — translate the common ones, fall back to the raw message
// for anything unexpected so it's still debuggable.
function readableAuthError(err: any): string {
  const code = err?.code || "";
  switch (code) {
    case "auth/email-already-in-use":
      return "That email is already signed up — try signing in instead.";
    case "auth/weak-password":
      return "Password needs to be at least 6 characters.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email or password didn't match. Double check and try again.";
    default:
      return err?.message || "Something went wrong signing in.";
  }
}

/**
 * Sign-in / sign-up screen
 * The gate in front of everything else — no leagueId/playerId prompt anymore,
 * because playerId now comes from the authenticated user, not a text field
 * someone could type someone else's id into.
 */

import React, { useState } from "react";
import { useAuth } from "./AuthContext";

// For Week 0, the league id is fixed to the test league rather than typed in —
// swap this for a real league picker once there's more than one league to join.
const WEEK0_LEAGUE_ID = "week0-test-league";

export function AuthScreen() {
  const { signUp, signIn, authError } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await signUp(email, password, displayName, WEEK0_LEAGUE_ID);
      } else {
        await signIn(email, password);
      }
    } catch {
      // authError is already set by AuthContext; nothing else to do here.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1 text-center">Week 0 Test</h1>
        <p className="text-sm text-gray-600 mb-6 text-center">
          {mode === "signup" ? "Create your account to pick this week's games" : "Sign in to your account"}
        </p>

        <div className="flex mb-6 border rounded overflow-hidden">
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 py-2 text-sm font-medium ${
              mode === "signup" ? "bg-blue-500 text-white" : "bg-white text-gray-600"
            }`}
          >
            Sign up
          </button>
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 py-2 text-sm font-medium ${
              mode === "signin" ? "bg-blue-500 text-white" : "bg-white text-gray-600"
            }`}
          >
            Sign in
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Team / display name
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Paterus Maximus"
                className="w-full border p-2 rounded"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border p-2 rounded"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border p-2 rounded"
            />
          </div>

          {authError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-2 px-4 rounded"
          >
            {submitting ? "..." : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

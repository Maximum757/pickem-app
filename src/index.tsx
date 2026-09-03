/**
 * React App Entry Point
 * AuthProvider gates everything below it — no player renders until they're
 * actually signed in. This replaces the old REACT_APP_PLAYER_ID env var
 * approach entirely; that was a placeholder for exactly this.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { AuthGate } from "./AuthGate";
import { AuthProvider } from "./AuthContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  </React.StrictMode>
);

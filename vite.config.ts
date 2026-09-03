import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vite only exposes env vars prefixed VITE_ to browser code by default
  // (a deliberate security boundary — it stops server-only secrets from
  // leaking into the client bundle). This app's .env.local already uses
  // REACT_APP_* naming (a holdover from the original Create React App
  // plan), so rather than have every teammate re-do their .env.local,
  // Vite is told to treat that prefix as exposable too.
  envPrefix: "REACT_APP_",
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});

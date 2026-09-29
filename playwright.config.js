import { defineConfig } from "@playwright/test";

// The suite gets its own port so a test run never tears down a dev server
// someone is using. `npm run dev` uses 5173.
const PORT = process.env.PORT || "4399";
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: { baseURL: BASE },
  projects: [
    { name: "api", testMatch: /(api|share|export)\.spec\.js/ },
    { name: "browser", testMatch: /(render|snap|arrange-undo|share-ui|panel-memory|note-routing|edge-overlap|edge-undo|format-panel)\.spec\.js/, use: { browserName: "chromium" } },
  ],
  webServer: {
    // Prod build + prod-like server (NODE_ENV=production via `npm run start`),
    // NOT a dev server: the strict CSP has no 'unsafe-eval', which dev HMR needs,
    // and the local auth bypass is gated OFF under production - so these specs
    // exercise exactly what ships.
    command: `npm run build && npx next start --port ${PORT}`,
    url: `${BASE}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * E2E runs against the REAL production artifact: the built React SPA served by
 * the Firebase Hosting emulator at :5050, with `/api/*` and `/:code` handled by
 * the Cloud Function — exactly what deploys. `webServer` builds everything and
 * boots the emulators for us (locally it reuses an already-running instance).
 */
const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:5050";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Tests share one Firestore emulator; run serially so click counts / list
  // ordering are deterministic. (Each test still uses unique codes.)
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: require.resolve("./global-setup"),
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Build functions + web, then start the emulators serving the built app.
    command: "npm run e2e:app",
    cwd: path.resolve(__dirname, ".."),
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

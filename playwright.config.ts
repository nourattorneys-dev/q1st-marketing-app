import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, E2E_ENGINE_KEY, E2E_PORT } from "./tests/e2e/constants";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  expect: { timeout: 10_000 },
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A clean production build: it proves the Cache Components rules hold, and starting from an empty
    // .next avoids an incremental build reusing stale compiled CSS (seen 2026-10-21 after a globals.css edit).
    command: `rm -rf .next && pnpm build && pnpm start -p ${E2E_PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { ENGINE_MODE: "mock", AUTH_MODE: "mock", ENGINE_API_KEY: E2E_ENGINE_KEY },
  },
});

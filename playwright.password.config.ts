import { defineConfig, devices } from "@playwright/test";
import { E2E_PASSWORD_DB, E2E_PASSWORD_PORT, E2E_PASSWORD_URL, OWNER_EMAIL } from "./tests/e2e-password/constants";
import { testDatabaseUrl } from "./tests/unit/postgres-test-db";

/**
 * The password-mode suite (spec M5c): the production build the main suite made (pnpm e2e runs that one first; alone,
 * run ALLOW_TEST_LOGINS=1 pnpm build before pnpm e2e:password), started with AUTH_MODE=password on the local Postgres. Playwright starts the
 * server before globalSetup, which recreates the database: /api/health, which Playwright polls, never touches it.
 */
export default defineConfig({
  testDir: "tests/e2e-password",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e-password/global-setup.ts",
  use: { baseURL: E2E_PASSWORD_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm start -p ${E2E_PASSWORD_PORT}`,
    url: `${E2E_PASSWORD_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AUTH_MODE: "password",
      APP_URL: E2E_PASSWORD_URL,
      ADMIN_EMAIL: OWNER_EMAIL,
      TWO_FACTOR: "off",
      DB_MODE: "postgres",
      DATABASE_URL: testDatabaseUrl(E2E_PASSWORD_DB),
      EMAIL_MODE: "log",
      // A test server: the dev outbox, which these tests read invitation and reset links from, opens only on one.
      ALLOW_TEST_LOGINS: "1",
      ENGINE_MODE: "mock",
    },
  },
});

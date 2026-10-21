export const E2E_PORT = 3100;
export const BASE_URL = `http://localhost:${E2E_PORT}`;
/** Passed to the server as ENGINE_API_KEY; must never appear in anything the browser receives. */
export const E2E_ENGINE_KEY = "e2e-secret-key-do-not-leak";
/** Passed to the server as CRON_SECRET; the e2e suite calls the notifications cron with it. */
export const E2E_CRON_SECRET = "e2e-cron-secret";

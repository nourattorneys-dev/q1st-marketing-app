export const E2E_PORT = 3100;
export const BASE_URL = `http://localhost:${E2E_PORT}`;
/** Passed to the server as ENGINE_API_KEY; must never appear in anything the browser receives. */
export const E2E_ENGINE_KEY = "e2e-secret-key-do-not-leak";

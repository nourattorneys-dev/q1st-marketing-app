import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getStore (DB_MODE=postgres)", () => {
  it("keeps one Postgres pool per server process, even across separately loaded copies of the module (two runtimes would otherwise open two pools)", async () => {
    // The server build loads the store module once for route handlers and once for pages; resetModules does the same here.
    vi.stubEnv("DB_MODE", "postgres");
    vi.stubEnv("DATABASE_URL", "postgres://nobody@127.0.0.1:1/never");
    const first = (await import("@/lib/db")).getStore("site_a");
    vi.resetModules();
    const second = (await import("@/lib/db")).getStore("site_a");
    expect(second).toBe(first);
  });

  it("gives the account store the same Postgres pool, once per process (spec M5c)", async () => {
    vi.stubEnv("DB_MODE", "postgres");
    vi.stubEnv("DATABASE_URL", "postgres://nobody@127.0.0.1:1/never");
    const first = (await import("@/lib/db")).getAccountStore();
    vi.resetModules();
    expect((await import("@/lib/db")).getAccountStore()).toBe(first);
  });
});

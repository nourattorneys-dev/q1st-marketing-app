import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/db/memory-store";
import type { AppStore } from "@/lib/db/store";
import { createLogMailer } from "@/lib/notifications/mailer";
import type { Mailer } from "@/lib/notifications/mailer";
import { DirectoryError } from "@/lib/users/types";

let store: AppStore;
const directory = { list: vi.fn() };
vi.mock("@/lib/db", () => ({ getStore: () => store }));
// The route waits for a request (connection()) so the build never runs it; here every call is a request.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));
vi.mock("@/lib/users/directory", () => ({ getDirectory: async () => directory }));
let mailer: Mailer | null = null;
// A case can hold the sending up; the others get the settings' choice (the log mailer, EMAIL_MODE=log).
vi.mock("@/lib/notifications/mailer", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/notifications/mailer")>();
  return { ...original, mailerFor: (env: Parameters<typeof original.mailerFor>[0]) => mailer ?? original.mailerFor(env) };
});

const { GET } = await import("@/app/api/cron/notifications/route");
const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/notifications", { headers: authorization ? { Authorization: authorization } : {} }));
const REVIEWER = { id: "r1", name: "R", email: "reviewer@example.com", role: "reviewer", twoFactor: false, lastSignInAt: null };

async function queueDraft(id: string) {
  await store.recordEvent({ id, event: "post.drafted", receivedAt: new Date() }, { eventId: id, kind: "drafted", audience: "reviewers", data: { postId: "p_1" }, createdAt: new Date() });
}

beforeEach(() => {
  mailer = null;
  vi.stubEnv("DB_MODE", "memory");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("EMAIL_MODE", "log");
  vi.stubEnv("CRON_SECRET", "cron-secret");
  vi.stubEnv("NOTIFY_QUIET_SECONDS", "0");
  store = createMemoryStore();
  directory.list.mockReset();
  directory.list.mockResolvedValue({ users: [REVIEWER], invites: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/notifications (Vercel Cron)", () => {
  it("refuses a call without the cron secret, or when none is set", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
  });

  it("sends what's due, linking to the address the webhook was set up on", async () => {
    await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:x", updatedAt: new Date() });
    await queueDraft(`evt_cron_${Date.now()}`);
    const response = await call("Bearer cron-secret");
    expect(await response.json()).toEqual({ ok: true, data: { batches: 1, emails: 1, failed: 0 } });
    expect(createLogMailer().outbox().at(-1)).toMatchObject({ to: "reviewer@example.com", html: expect.stringContaining("https://portal.example/en/review") });
  });

  it("answers 503 and keeps everything pending when the sign-in service can't be reached", async () => {
    directory.list.mockRejectedValue(new DirectoryError("unavailable", "The sign-in service can't be reached right now. Try again shortly."));
    await queueDraft("evt_cron_down");
    const response = await call("Bearer cron-secret");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "unavailable" } });
    expect(await store.pendingNotifications()).toHaveLength(1);
  });

  it("runs one flush at a time: a call while another is sending skips, so each email goes out once (M5b)", async () => {
    await queueDraft("evt_cron_once");
    let release = () => {};
    const holding = new Promise<void>((resolve) => (release = resolve));
    const sent: string[] = [];
    mailer = {
      async send(email) {
        sent.push(email.to);
        await holding;
      },
    };
    const first = call("Bearer cron-secret");
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    const second = call("Bearer cron-secret");
    await new Promise((resolve) => setTimeout(resolve, 50)); // time for a second run to reach the mail server, if it ran
    release();
    expect(await (await second).json()).toEqual({ ok: true, data: { skipped: true } });
    expect(await (await first).json()).toEqual({ ok: true, data: { batches: 1, emails: 1, failed: 0 } });
    expect(sent).toEqual(["reviewer@example.com"]);
  });

  it("a run that fails frees the lock: the next run sends (Review Focus 5)", async () => {
    directory.list.mockRejectedValueOnce(new DirectoryError("unavailable", "The sign-in service can't be reached right now. Try again shortly."));
    await queueDraft("evt_cron_retry");
    expect((await call("Bearer cron-secret")).status).toBe(503);
    expect(await (await call("Bearer cron-secret")).json()).toEqual({ ok: true, data: { batches: 1, emails: 1, failed: 0 } });
  });
});

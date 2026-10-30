import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/db/memory-store";
import type { AppStore } from "@/lib/db/store";
import { EngineError } from "@/lib/engine/errors";
import { decryptSecret } from "@/lib/webhooks/secret";
import { webhookStatus } from "@/lib/webhooks/status";

const KEY = Buffer.alloc(32, 5);
const HOOK = "https://portal.example/api/hooks/marketing";
let store: AppStore;
const engine = { saveWebhook: vi.fn() };
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "portal.example", "x-forwarded-proto": "https" }) }));
const requirePermission = vi.fn(async () => ({ userId: "dev_admin", email: "admin@example.com", name: "Admin", role: "admin", twoFactor: true }));
vi.mock("@/lib/auth/session", () => ({ requirePermission }));
vi.mock("@/lib/engine", () => ({ getEngine: async () => engine }));
vi.mock("@/lib/db", () => ({ getStore: () => store }));
vi.mock("@/lib/tenancy", () => ({ getCurrentSite: async () => ({ client: { id: "cli_test", name: "Test" }, site: { id: "site_fakher", name: "Fakher" }, sites: [] }) }));

const { setUpWebhookAction } = await import("@/app/[locale]/(app)/settings/webhook/actions");
const key = "key-12345678";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DB_MODE", "memory");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("WEBHOOK_ENCRYPTION_KEY", KEY.toString("base64"));
  store = createMemoryStore("site_fakher");
  engine.saveWebhook.mockResolvedValue({ url: HOOK, events: ["post.drafted"], secret: "whsec_new" });
});
afterEach(() => vi.unstubAllEnvs());

describe("setting up the webhook (design §11; spec v1.1 §7)", () => {
  it("registers this portal's address for every event with a new secret, stores it encrypted, and never returns it (Review Focus 3)", async () => {
    const result = await setUpWebhookAction({ locale: "en", idempotencyKey: key });
    expect(result).toEqual({ ok: true, data: { connected: true } });
    expect(JSON.stringify(result)).not.toContain("whsec_new");
    expect(requirePermission).toHaveBeenCalledWith("en", "settings.manage");
    expect(engine.saveWebhook).toHaveBeenCalledWith(
      { url: HOOK, events: expect.arrayContaining(["post.drafted", "quota.exceeded"]), rotateSecret: true },
      expect.objectContaining({ actingUser: "admin@example.com", idempotencyKey: key }),
    );
    const saved = await store.webhook();
    expect(saved?.url).toBe(HOOK);
    expect(saved?.secretCipher).not.toContain("whsec_new");
    expect(decryptSecret(saved?.secretCipher ?? "", KEY)).toBe("whsec_new");
  });

  it("keeps nothing when the engine refuses or returns no secret", async () => {
    engine.saveWebhook.mockRejectedValueOnce(new EngineError({ status: 400, code: "invalid_input", message: "Check the highlighted fields." }));
    expect(await setUpWebhookAction({ locale: "en", idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    engine.saveWebhook.mockResolvedValueOnce({ url: HOOK, events: ["post.drafted"] });
    expect(await setUpWebhookAction({ locale: "en", idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_response" } });
    expect(await store.webhook()).toBeNull();
  });

  it("doesn't ask for a secret it couldn't keep: Postgres without WEBHOOK_ENCRYPTION_KEY", async () => {
    vi.stubEnv("DB_MODE", "postgres");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db");
    vi.stubEnv("WEBHOOK_ENCRYPTION_KEY", "");
    expect(await setUpWebhookAction({ locale: "en", idempotencyKey: key })).toMatchObject({ ok: false, error: { status: 503, code: "not_configured" } });
    expect(engine.saveWebhook).not.toHaveBeenCalled();
  });
});

describe("webhookStatus", () => {
  it("is off, registered elsewhere, missing its secret, or connected (Review Focus 3)", () => {
    expect(webhookStatus(null, null, HOOK)).toBe("off");
    expect(webhookStatus("", HOOK, HOOK)).toBe("off");
    expect(webhookStatus("https://preview.example/api/hooks/marketing", HOOK, HOOK)).toBe("elsewhere");
    expect(webhookStatus(HOOK, null, HOOK)).toBe("secretMissing");
    expect(webhookStatus(HOOK, "https://old.example/api/hooks/marketing", HOOK)).toBe("secretMissing");
    expect(webhookStatus(HOOK, HOOK, HOOK)).toBe("connected");
    expect(webhookStatus(HOOK, HOOK, null)).toBe("elsewhere");
  });
});


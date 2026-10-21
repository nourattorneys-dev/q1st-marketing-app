import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/db/memory-store";
import type { AppStore } from "@/lib/db/store";

let store: AppStore;
const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh }));
const requireSession = vi.fn(async () => ({ userId: "dev_reviewer", email: "reviewer@example.com", name: "R", role: "reviewer", twoFactor: false }));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("@/lib/db", () => ({ getStore: () => store }));

const { setEmailNotificationsAction } = await import("@/app/[locale]/(app)/notifications/actions");
const key = "key-12345678";

beforeEach(() => {
  vi.clearAllMocks();
  store = createMemoryStore();
});

describe("each person's email setting (design §4 preferences)", () => {
  it("turns the signed-in person's emails off and on again, and refreshes the page", async () => {
    expect(await setEmailNotificationsAction({ locale: "en", enabled: false, idempotencyKey: key })).toEqual({ ok: true, data: { enabled: false } });
    expect(requireSession).toHaveBeenCalledWith("en");
    expect([...(await store.emailOffUsers())]).toEqual(["dev_reviewer"]);
    await setEmailNotificationsAction({ locale: "ar", enabled: true, idempotencyKey: key });
    expect([...(await store.emailOffUsers())]).toEqual([]);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("refuses a malformed request without changing anything", async () => {
    expect(await setEmailNotificationsAction({ locale: "en", enabled: "no" as never, idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(requireSession).not.toHaveBeenCalled();
    expect([...(await store.emailOffUsers())]).toEqual([]);
  });
});


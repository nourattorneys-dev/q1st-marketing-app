import { describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/db/memory-store";
import type { AppStore, Audience, StoredNotification } from "@/lib/db/store";
import { dueBatches } from "@/lib/notifications/batches";
import { flushNotifications } from "@/lib/notifications/flush";
import { createLogMailer, type Email } from "@/lib/notifications/mailer";
import { recipientsFor } from "@/lib/notifications/recipients";
import { renderBatch } from "@/lib/notifications/render";
import type { DirectoryUser } from "@/lib/users/types";

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 22, 8, 0, 0) + seconds * 1000);
const item = (eventId: string, kind: string, audience: Audience, data: Record<string, unknown>, seconds = 0): StoredNotification => ({
  eventId,
  kind,
  audience,
  data,
  createdAt: at(seconds),
});
const user = (id: string, role: DirectoryUser["role"], email: string): DirectoryUser => ({ id, name: id, email, role, twoFactor: false, lastSignInAt: null });
const USERS = [
  user("a1", "admin", "Admin@Example.com"),
  user("a2", "admin", "admin2@example.com"),
  user("r1", "reviewer", "reviewer@example.com"),
  user("n1", null, "pending@example.com"),
];
const ORIGIN = "https://portal.example";

describe("batches (design §10: emails are grouped per batch)", () => {
  const pending = [item("e1", "drafted", "reviewers", {}, 0), item("e2", "failed", "admins", {}, 10), item("e3", "drafted", "reviewers", {}, 20)];

  it("puts each audience's pending notifications in one batch once the quiet period has passed", () => {
    expect(dueBatches(pending, at(200), 60_000)).toEqual([
      { audience: "reviewers", items: [pending[0], pending[2]] },
      { audience: "admins", items: [pending[1]] },
    ]);
  });

  it("waits while an audience's notifications are still arriving", () => {
    expect(dueBatches(pending, at(50), 60_000)).toEqual([]);
    expect(dueBatches(pending, at(75), 60_000)).toEqual([{ audience: "admins", items: [pending[1]] }]);
  });
});

describe("recipients (design §10)", () => {
  it("sends drafts to Reviewers and the rest to Admins, never to someone without a role", () => {
    expect(recipientsFor("reviewers", USERS, new Set())).toEqual([{ userId: "r1", email: "reviewer@example.com" }]);
    expect(recipientsFor("admins", USERS, new Set())).toEqual([
      { userId: "a1", email: "admin@example.com" },
      { userId: "a2", email: "admin2@example.com" },
    ]);
  });

  it("sends drafts to the Admins when there are no Reviewers, so they aren't lost (Review Focus 5)", () => {
    expect(recipientsFor("reviewers", USERS.filter((u) => u.role !== "reviewer"), new Set()).map((r) => r.userId)).toEqual(["a1", "a2"]);
  });

  it("leaves out people who turned email off, without falling back when the Reviewers did (Review Focus 5)", () => {
    expect(recipientsFor("admins", USERS, new Set(["a2"]))).toEqual([{ userId: "a1", email: "admin@example.com" }]);
    expect(recipientsFor("reviewers", USERS, new Set(["r1"]))).toEqual([]);
  });

  it("emails each address once", () => {
    expect(recipientsFor("admins", [...USERS, user("a3", "admin", " ADMIN@example.com ")], new Set())).toHaveLength(2);
  });
});

describe("the email (design §10: bilingual, one per batch)", () => {
  it("counts the drafts in one line, in English then Arabic, with links to both languages", () => {
    const email = renderBatch(
      { audience: "reviewers", items: ["e1", "e2", "e3"].map((id) => item(id, "drafted", "reviewers", { postId: id })) },
      ORIGIN,
    );
    expect(email.subject).toBe("3 drafts ready for review · 3 مسودات جاهزة للمراجعة");
    expect(email.html).toContain('<a href="https://portal.example/en/review">3 drafts are ready for review</a>');
    expect(email.html).toContain('<div dir="rtl" lang="ar"');
    expect(email.html).toContain("https://portal.example/ar/review");
    expect(email.html).toContain("https://portal.example/en/notifications");
    expect(email.text).toContain("- 3 drafts are ready for review: https://portal.example/en/review");
  });

  it("lists each of the Admin's updates once, in its latest state, and escapes the engine's text (Review Focus 4)", () => {
    const email = renderBatch(
      {
        audience: "admins",
        items: [
          item("e1", "failed", "admins", { postId: "p_1", error: "<b>refused</b>" }),
          item("e2", "connection", "admins", { type: "linkedin", status: "error" }),
          item("e3", "connection", "admins", { type: "linkedin", status: "expiring" }),
          item("e4", "connection", "admins", { type: "website", status: "<img src=x onerror=alert(1)>" }),
          item("e5", "quotaWarning", "admins", { metric: "articles", used: 36, limit: 40 }),
          item("e6", "scan", "admins", { findings: 7 }),
        ],
      },
      ORIGIN,
    );
    expect(email.subject).toBe("5 updates need your attention · 5 تحديثات تحتاج إلى انتباهك");
    expect(email.text).toContain("- 1 post failed to publish: https://portal.example/en/history");
    expect(email.text).toContain("- LinkedIn connection: expiring soon: https://portal.example/en/settings/social");
    expect(email.text).not.toContain("not working");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(email.text).toContain("- Articles: 36 of 40 used this month: https://portal.example/en/plan");
    expect(email.text).toContain("- Site scan finished: 7 findings: https://portal.example/en/site-health");
    expect(`${email.subject}${email.text}`).not.toMatch(/[٠-٩]/);
  });

  it("has no links before this dashboard's address is known", () => {
    const email = renderBatch({ audience: "reviewers", items: [item("e1", "drafted", "reviewers", { postId: "p_1" })] }, null);
    expect(email.html).not.toContain("<a ");
    expect(email.text).not.toContain("http");
  });
});

describe("mailers", () => {
  it("the log mailer keeps what it would have sent, once per idempotency key", async () => {
    const mailer = createLogMailer();
    const key = `log-${Date.now()}`;
    const before = mailer.outbox().length;
    await mailer.send({ to: "a@example.com", subject: "S", html: "h", text: "t", idempotencyKey: key });
    await mailer.send({ to: "a@example.com", subject: "S", html: "h", text: "t", idempotencyKey: key });
    expect(mailer.outbox().length - before).toBe(1);
  });
});

describe("flushNotifications", () => {
  async function seeded(): Promise<AppStore> {
    const store = createMemoryStore();
    for (const [id, seconds] of [["e1", 0], ["e2", 1], ["e3", 2]] as const) {
      await store.recordEvent({ id, event: "post.drafted", receivedAt: at(seconds) }, item(id, "drafted", "reviewers", { postId: id }, seconds));
    }
    await store.recordEvent({ id: "e4", event: "post.failed", receivedAt: at(3) }, item("e4", "failed", "admins", { postId: "p_4", error: null }, 3));
    return store;
  }

  function fakeMailer(fails: (to: string) => boolean = () => false) {
    const attempts: Email[] = [];
    return {
      attempts,
      mailer: {
        async send(email: Email) {
          attempts.push(email);
          if (fails(email.to)) throw new Error("refused");
        },
      },
    };
  }

  const options = (store: AppStore, mailer: { send(email: Email): Promise<void> }, seconds: number) => ({
    store,
    mailer,
    users: async () => USERS,
    origin: ORIGIN,
    now: at(seconds),
    quietMs: 120_000,
  });

  it("sends one email per person per batch, marks it sent, and then has nothing left (Review Focus 2)", async () => {
    const store = await seeded();
    const { attempts, mailer } = fakeMailer();
    expect(await flushNotifications(options(store, mailer, 200))).toEqual({ batches: 2, emails: 3, failed: 0 });
    expect(attempts.map((email) => [email.to, email.subject.split(" · ")[0]])).toEqual([
      ["reviewer@example.com", "3 drafts ready for review"],
      ["admin@example.com", "1 update needs your attention"],
      ["admin2@example.com", "1 update needs your attention"],
    ]);
    expect(await store.pendingNotifications()).toEqual([]);
    expect(await flushNotifications(options(store, mailer, 400))).toEqual({ batches: 0, emails: 0, failed: 0 });
  });

  it("keeps a batch pending when an email fails; the retry emails only the person it missed, with the same key (Review Focus 2)", async () => {
    const store = await seeded();
    const first = fakeMailer((to) => to === "admin2@example.com");
    expect(await flushNotifications(options(store, first.mailer, 200))).toEqual({ batches: 2, emails: 2, failed: 1 });
    expect((await store.pendingNotifications()).map((n) => n.eventId)).toEqual(["e4"]);
    const second = fakeMailer();
    expect(await flushNotifications(options(store, second.mailer, 500))).toEqual({ batches: 1, emails: 1, failed: 0 });
    expect(second.attempts.map((email) => email.to)).toEqual(["admin2@example.com"]);
    const keyFor = (attempts: Email[], to: string) => attempts.find((email) => email.to === to)?.idempotencyKey;
    expect(keyFor(second.attempts, "admin2@example.com")).toBe(keyFor(first.attempts, "admin2@example.com"));
    expect(await store.pendingNotifications()).toEqual([]);
  });

  it("a retry after new items arrived sends each person only what's new to them (final review; Review Focus 2)", async () => {
    const store = await seeded();
    const first = fakeMailer((to) => to === "admin2@example.com");
    await flushNotifications(options(store, first.mailer, 200));
    await store.recordEvent({ id: "e5", event: "post.failed", receivedAt: at(300) }, item("e5", "failed", "admins", { postId: "p_5", error: null }, 300));
    const second = fakeMailer();
    expect(await flushNotifications(options(store, second.mailer, 500))).toEqual({ batches: 1, emails: 2, failed: 0 });
    expect(second.attempts.map((email) => email.to)).toEqual(["admin@example.com", "admin2@example.com"]);
    expect(second.attempts[0].text).toContain("1 post failed to publish");
    expect(second.attempts[1].text).toContain("2 posts failed to publish");
    expect(await store.pendingNotifications()).toEqual([]);
  });

  it("stops waiting for someone it can't reach after a day, without emailing anyone else again (final review)", async () => {
    const store = await seeded();
    const failing = () => fakeMailer((to) => to === "admin2@example.com");
    await flushNotifications(options(store, failing().mailer, 200));
    const later = failing();
    expect(await flushNotifications(options(store, later.mailer, 3600))).toEqual({ batches: 1, emails: 0, failed: 1 });
    expect(later.attempts.map((email) => email.to)).toEqual(["admin2@example.com"]);
    expect((await store.pendingNotifications()).map((n) => n.eventId)).toEqual(["e4"]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await flushNotifications(options(store, failing().mailer, 25 * 3600))).toEqual({ batches: 1, emails: 0, failed: 1 });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    expect(await store.pendingNotifications()).toEqual([]);
  });

  it("waits for the quiet period, and forgets deliveries older than 30 days", async () => {
    const store = await seeded();
    await store.recordEvent({ id: "e_old", event: "plan.changed", receivedAt: at(-31 * 86_400) }, null);
    const { attempts, mailer } = fakeMailer();
    expect(await flushNotifications(options(store, mailer, 30))).toEqual({ batches: 0, emails: 0, failed: 0 });
    expect(attempts).toEqual([]);
    expect(await store.hasEvent("e_old")).toBe(false);
    expect(await store.hasEvent("e1")).toBe(true);
  });
});

# M4c: Database, Webhooks and Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the rest of design §13 M4:
- **The dashboard's small database** (design §4, D14):
  - webhook event ids already handled (kept 30 days)
  - the webhook secret, encrypted
  - the notification log and each person's email preference
- **The webhook receiver** `POST /api/hooks/marketing` (spec v1.1 §8; design §4, §11, §14):
  - HMAC over the raw body, compared in constant time
  - a repeated `X-Event-Id` is ignored
- **The webhook setup** (spec v1.1 §6 /account "Webhook URL setup", §7 `GET/PUT …/webhook`; design §5 "Settings: … webhook"): a Settings page that registers this dashboard's address and keeps the secret the engine returns once.
- **Email notifications through Resend** (design §10):
  - drafts ready go to Reviewers
  - failed posts, broken or expiring connections, quota warnings and finished scans go to the Admin
  - emails are grouped per batch, never one per item
  - each person can turn their emails off

**Architecture:**
- **One `AppStore` interface with two implementations,** chosen by `DB_MODE`:
  - an in-memory store per server process (local and e2e)
  - a Neon Postgres store through Drizzle (Vercel)
- **The receiver checks before it trusts:**
  1. It checks the signature against the stored secret, decrypted with `WEBHOOK_ENCRYPTION_KEY`.
  2. It records the event id together with the notification the event causes.
  3. It answers.
- **A cron route sends the emails** (Vercel Cron, every 5 minutes, `CRON_SECRET`):
  1. It groups pending notifications per audience, once a quiet period has passed.
  2. It finds the recipients in the M4b user directory.
  3. It sends one bilingual email per person, through `EMAIL_MODE=resend` or a local log.
- **In mock mode the mock engine can deliver signed events** to the registered address. That tests the real chain end to end.

**Tech Stack:**
- Already in use: Next.js 16.4 (App Router, Cache Components), React 19.3, TypeScript 5, next-intl 4.14, Zod 4.6, Vitest 5, Playwright 1.64.
- **New, from the approved stack (design §17):**
  - `drizzle-orm` 0.45.4
  - `@neondatabase/serverless` 1.2.0
  - `drizzle-kit` 0.31.11 (dev)
  - `resend` 6.34.1
- Node's `crypto` (AES-256-GCM, HMAC-SHA256, `timingSafeEqual`).

**Spec:**
- `docs/specs/2026-10-21-marketing-dashboard-design.md`:
  - §4: architecture items 4 (webhook receiver) and 6 (small database)
  - §8: data flow
  - §10: notifications
  - §11: security
  - §14: the webhook unit tests
  - §17: stack
- `docs/specs/Marketing Portal Build Spec v1.1.html`:
  - §6 /account: webhook URL setup
  - §7: `GET / PUT …/webhook`
  - §8: webhooks
  - §10: the acceptance item "The webhook handler rejects a request with a wrong signature and ignores a repeated X-Event-Id"
- Follow-ups: `docs/plans/2026-10-22-m4b-followups.md` and `2026-10-22-m3a-followups.md` (webhook badges)

## Global Constraints

- **Earlier constraints still hold:** all M1–M4b Global Constraints. In particular:
  - Cache Components: runtime data only inside `<Suspense>`
  - server-side role checks on every page and action
  - Latin digits and logical CSS
  - never "law firm"
  - changes go through server actions via `useEngineAction`
  - every e2e test isolates the mock store
- **Packages:** only the four listed in Tech Stack, at those exact versions. **No React Email:** it's an optional peer of `resend`, and the templates are plain HTML and text built from the message files, so both languages stay in `messages/*.json`.
- **Secrets never reach the browser or the database in clear:**
  - The webhook secret is stored only as AES-256-GCM ciphertext.
  - `WEBHOOK_ENCRYPTION_KEY`, `DATABASE_URL`, `RESEND_API_KEY` and `CRON_SECRET` are server-only environment variables (never `NEXT_PUBLIC_`).
- **Runs locally without Neon or Resend keys:**
  - The defaults are `DB_MODE=memory` and `EMAIL_MODE=log`.
  - `DB_MODE=memory` is refused on Vercel, because each server instance has its own memory.
- **No screens are cached** (every page reads the engine on each request), so the receiver's job is to record and notify. It invalidates nothing.
  - `job.finished`, `post.published`, `suggestions.created`, `keywords.proposed`, `plan.changed` and `performance.refresh_suggested` are acknowledged and recorded, with no email.
  - Open screens keep updating as before, through the job polling.
- **Webhook events are the spec's list** (spec v1.1 §8, 12 events). An event the dashboard doesn't know is acknowledged (so the engine stops retrying) and otherwise ignored.
- **Emails are bilingual:**
  - English then Arabic in one message (`dir="rtl"` for the Arabic part).
  - Links to both `/en/…` and `/ar/…`.
  - Times aren't shown, so no timezone is needed.
  - Engine-supplied text is HTML-escaped.
- **Mock-only behaviour** (test logins with the mock engine):
  - `POST /api/dev/mock-webhook` makes the mock engine deliver a signed event.
  - `GET /api/dev/outbox` lists the emails `EMAIL_MODE=log` kept.
  - Both answer 404 unless `AUTH_MODE=mock` and the mock engine (or the log mailer) are in use.
  - The in-memory store is one per server process, not per `mock_store` namespace: the engine has no cookie when it delivers.

## Review Focus

1. **A delivery that can't be verified changes nothing.** That covers:
   - a wrong signature
   - a missing signature
   - a body changed after signing
   - a delivery before the webhook is set up
   - a stored secret this key can't decrypt

   Each is refused with 401. **A repeated `X-Event-Id` is acknowledged without a second email.**
   - *Pinned by:* Task 4 unit tests and Task 5 e2e.
2. **Emails are grouped: one email per person per batch, never one per draft.** A batch whose sending failed part-way is retried without emailing anyone twice.
   - *Pinned by:* Task 6 unit tests and e2e.
3. **The signing secret never reaches the browser or the database in clear.** After `WEBHOOK_ENCRYPTION_KEY` changes, the Webhook page says a new secret is needed instead of failing silently.
   - *Pinned by:* Task 2 and Task 5 unit tests.
4. **Text the engine sends can't inject HTML into an email.** Connection statuses and error messages are escaped.
   - *Pinned by:* Task 6 unit tests.
5. **Recipients:**
   - Someone who turned email off gets none.
   - With no Reviewers, drafts go to the Admins, so they aren't lost.
   - People without a role never get email.
   - *Pinned by:* Task 6 unit tests and Task 7 e2e.

## File map (new unless marked)

```
package.json, pnpm-lock.yaml                 (modify) 4 packages; db:generate, db:migrate scripts
drizzle.config.ts                            drizzle-kit: schema → ./drizzle
drizzle/0000_*.sql                           the first migration (generated by drizzle-kit)
vercel.json                                  the notifications cron
.env.example                                 (modify) DB_MODE, DATABASE_URL, WEBHOOK_ENCRYPTION_KEY, EMAIL_*, CRON_SECRET, NOTIFY_QUIET_SECONDS
src/lib/services-env.ts                      parseServicesEnv / servicesEnv (server-only)
src/lib/db/{schema.ts,store.ts,memory-store.ts,neon-store.ts,index.ts}
src/lib/webhooks/{secret.ts,signature.ts,events.ts,status.ts}
src/lib/engine/schemas.ts, api.ts            (modify) webhook GET/PUT
src/lib/engine/mock/settings-store.ts, server.ts   (modify) mock webhook registration
src/lib/engine/mock/deliver.ts               the mock engine's signed delivery
src/app/api/hooks/marketing/route.ts         the receiver
src/app/api/dev/mock-webhook/route.ts        test logins only
src/app/api/dev/outbox/route.ts              test logins only
src/app/api/cron/notifications/route.ts      sends what's due
src/app/[locale]/(app)/settings/webhook/{page.tsx,actions.ts}
src/components/settings/{webhook-view.tsx,webhook-board.tsx}, settings-tabs.tsx (modify)
src/lib/notifications/{batches.ts,recipients.ts,render.ts,mailer.ts,flush.ts}
src/app/[locale]/(app)/notifications/{page.tsx,actions.ts}
src/components/notifications/{notifications-view.tsx,email-toggle.tsx}
src/components/shell/user-menu.tsx           (modify) Email notifications link
messages/en.json, messages/ar.json           (modify)
playwright.config.ts, tests/e2e/constants.ts, tests/e2e/helpers.ts   (modify)
tests/unit/{services-env,store,neon-store,webhooks,engine-webhook,hooks-route,webhook-settings,notifications,cron-route,notification-prefs}.test.ts
tests/e2e/{settings-webhook,notifications}.spec.ts
README.md, docs/plans/2026-10-22-m4c-followups.md, docs/plans/2026-10-22-m3a-followups.md (modify)
```

**Messages:** each task adds its keys to `messages/en.json` and `messages/ar.json` with `python3 .superpowers/tools/merge_messages.py FILE DOTTED.PATH FRAGMENT_FILE`. Keep the two files' keys identical (`tests/unit/messages.test.ts` checks it). Every task's messages are given in full, in both languages.

---

### Task 1: The dashboard's store: settings, schema, in-memory and Neon

**Files:**
- Create:
  - `src/lib/services-env.ts`
  - `src/lib/db/schema.ts`, `src/lib/db/store.ts`, `src/lib/db/memory-store.ts`, `src/lib/db/neon-store.ts`, `src/lib/db/index.ts`
  - `drizzle.config.ts`, `drizzle/0000_*.sql` (generated)
- Modify: `package.json` (+ lockfile), `.env.example`
- Test: create `tests/unit/services-env.test.ts`, `tests/unit/store.test.ts`, `tests/unit/neon-store.test.ts`

**Interfaces:**
- Consumes: nothing from earlier milestones except the `server-only` stub Vitest already aliases
- Produces:
  - **`parseServicesEnv(source)` / `servicesEnv()`:** returns `ServicesEnv`:
    - `{ dbMode: "memory" | "neon"; databaseUrl: string | null; encryptionKey: Buffer | null }`
    - `{ emailMode: "log" | "resend"; resend: { apiKey; from } | null; cronSecret: string | null; notifyQuietMs: number }`
  - **Types:** `Audience` (`"reviewers" | "admins"`), `StoredNotification` (`{ eventId, kind, audience, data, createdAt }`), `WebhookConfig` (`{ url, secretCipher, updatedAt }`)
  - **`interface AppStore`:**
    - events: `hasEvent`, `recordEvent(event, notification | null)`, `lastEventAt`
    - webhook: `webhook`, `saveWebhook`
    - notifications: `pendingNotifications`, `markSent(eventIds, recipients, at)`, `forgetBefore(cutoff)`
    - preferences: `emailOffUsers`, `setEmailOff(userId, off, at)`
  - **Implementations:** `createMemoryStore()`; `createNeonStore(db)` and its `queries`
  - **`getStore()`:** server-only

- [ ] **Step 1: Add the packages and the scripts**

Run:

```bash
pnpm add drizzle-orm@0.45.4 @neondatabase/serverless@1.2.0
pnpm add -D drizzle-kit@0.31.11
```

In `package.json` `"scripts"`, add after `"e2e"`: `"db:generate": "drizzle-kit generate",` and `"db:migrate": "drizzle-kit migrate"` (mind the commas).

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/services-env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseServicesEnv } from "@/lib/services-env";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("parseServicesEnv (M4c)", () => {
  it("defaults to the in-memory store and logged emails, with a two-minute quiet period", () => {
    expect(parseServicesEnv({})).toEqual({
      dbMode: "memory",
      databaseUrl: null,
      encryptionKey: null,
      emailMode: "log",
      resend: null,
      cronSecret: null,
      notifyQuietMs: 120_000,
    });
  });

  it("refuses the in-memory store on Vercel, and Neon without its address", () => {
    expect(() => parseServicesEnv({ VERCEL: "1" })).toThrow(/refused on Vercel/);
    expect(() => parseServicesEnv({ DB_MODE: "neon" })).toThrow(/needs DATABASE_URL/);
    expect(parseServicesEnv({ DB_MODE: "neon", DATABASE_URL: "postgres://u:p@host/db", VERCEL: "1" }).dbMode).toBe("neon");
  });

  it("takes a 32-byte encryption key and refuses any other length", () => {
    expect(parseServicesEnv({ WEBHOOK_ENCRYPTION_KEY: KEY }).encryptionKey?.length).toBe(32);
    expect(() => parseServicesEnv({ WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") })).toThrow(/32 bytes/);
  });

  it("sends through Resend only with a key and a sender", () => {
    expect(() => parseServicesEnv({ EMAIL_MODE: "resend", RESEND_API_KEY: "re_x" })).toThrow(/EMAIL_FROM/);
    expect(parseServicesEnv({ EMAIL_MODE: "resend", RESEND_API_KEY: "re_x", EMAIL_FROM: "Articles AI <notifications@fakhernco.com>" }).resend).toEqual({
      apiKey: "re_x",
      from: "Articles AI <notifications@fakhernco.com>",
    });
  });

  it("treats empty strings as unset and reads the quiet period in seconds", () => {
    expect(parseServicesEnv({ DB_MODE: "", CRON_SECRET: "", NOTIFY_QUIET_SECONDS: "0" })).toMatchObject({ dbMode: "memory", cronSecret: null, notifyQuietMs: 0 });
  });
});
```

Create `tests/unit/store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/db/memory-store";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 22, 8, minute));
const drafted = (eventId: string, minute: number) => ({
  eventId,
  kind: "drafted",
  audience: "reviewers" as const,
  data: { postId: `p_${eventId}` },
  createdAt: at(minute),
});

describe("the in-memory store (DB_MODE=memory)", () => {
  it("remembers a delivery once, with its notification, however often it's recorded (spec v1.1 §8: deliveries are retried)", async () => {
    const store = createMemoryStore();
    expect(await store.hasEvent("evt_1")).toBe(false);
    await store.recordEvent({ id: "evt_1", event: "post.drafted", receivedAt: at(0) }, drafted("evt_1", 0));
    await store.recordEvent({ id: "evt_1", event: "post.drafted", receivedAt: at(5) }, { ...drafted("evt_1", 5), data: { postId: "other" } });
    expect(await store.hasEvent("evt_1")).toBe(true);
    expect(await store.pendingNotifications()).toEqual([drafted("evt_1", 0)]);
    expect(await store.lastEventAt()).toEqual(at(0));
  });

  it("lists pending notifications oldest first and marks them sent once", async () => {
    const store = createMemoryStore();
    await store.recordEvent({ id: "evt_2", event: "post.drafted", receivedAt: at(2) }, drafted("evt_2", 2));
    await store.recordEvent({ id: "evt_1", event: "post.drafted", receivedAt: at(1) }, drafted("evt_1", 1));
    await store.recordEvent({ id: "evt_3", event: "post.published", receivedAt: at(3) }, null);
    expect((await store.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_1", "evt_2"]);
    await store.markSent(["evt_1"], ["reviewer@example.com"], at(4));
    expect((await store.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_2"]);
    expect(await store.lastEventAt()).toEqual(at(3));
  });

  it("forgets deliveries and sent notifications older than the cutoff, but never an unsent one", async () => {
    const store = createMemoryStore();
    await store.recordEvent({ id: "evt_old", event: "post.drafted", receivedAt: at(0) }, drafted("evt_old", 0));
    await store.recordEvent({ id: "evt_sent", event: "post.drafted", receivedAt: at(1) }, drafted("evt_sent", 1));
    await store.markSent(["evt_sent"], [], at(2));
    await store.forgetBefore(at(10));
    expect(await store.hasEvent("evt_old")).toBe(false);
    expect((await store.pendingNotifications()).map((item) => item.eventId)).toEqual(["evt_old"]);
  });

  it("keeps one webhook registration and each person's email choice", async () => {
    const store = createMemoryStore();
    expect(await store.webhook()).toBeNull();
    await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:a", updatedAt: at(0) });
    await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:b", updatedAt: at(1) });
    expect(await store.webhook()).toEqual({ url: "https://portal.example/api/hooks/marketing", secretCipher: "v1:b", updatedAt: at(1) });
    await store.setEmailOff("user_1", true, at(0));
    await store.setEmailOff("user_2", true, at(0));
    await store.setEmailOff("user_2", false, at(1));
    expect([...(await store.emailOffUsers())]).toEqual(["user_1"]);
  });
});
```

Create `tests/unit/neon-store.test.ts`:

```ts
import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";
import { queries } from "@/lib/db/neon-store";
import * as schema from "@/lib/db/schema";

// No database runs locally: these read the SQL the Neon store sends. The go-live check runs it against Neon (README).
const db = drizzle.mock({ schema });
const AT = new Date("2026-10-22T08:00:00Z");

describe("the Neon store's SQL (DB_MODE=neon)", () => {
  it("records a delivery and its notification without overwriting either (a retried delivery)", () => {
    const notification = queries
      .insertNotification(db, { eventId: "evt_1", kind: "drafted", audience: "reviewers", data: { postId: "p_1" }, createdAt: AT })
      .toSQL();
    expect(notification.sql).toMatch(/^insert into "notifications"/);
    expect(notification.sql).toMatch(/on conflict do nothing$/);
    expect(notification.params).toContain("evt_1");
    const event = queries.insertEvent(db, { id: "evt_1", event: "post.drafted", receivedAt: AT }).toSQL();
    expect(event.sql).toMatch(/^insert into "webhook_events"/);
    expect(event.sql).toMatch(/on conflict do nothing$/);
  });

  it("reads pending notifications oldest first, and marks only unsent ones sent", () => {
    const pending = queries.pending(db).toSQL().sql;
    expect(pending).toMatch(/"sent_at" is null/);
    expect(pending).toMatch(/order by "notifications"\."created_at"/);
    const marked = queries.markSent(db, ["evt_1", "evt_2"], ["r@example.com"], AT).toSQL().sql;
    expect(marked).toMatch(/^update "notifications" set "sent_at" = \$\d+, "recipients" = \$\d+/);
    expect(marked).toMatch(/"event_id" in \(\$\d+, \$\d+\)/);
    expect(marked).toMatch(/"sent_at" is null/);
  });

  it("keeps one webhook row and one preference row per person, updating them in place", () => {
    expect(queries.saveWebhook(db, { url: "https://p.example/api/hooks/marketing", secretCipher: "v1:x", updatedAt: AT }).toSQL().sql).toMatch(
      /on conflict \("id"\) do update set/,
    );
    expect(queries.setEmailOff(db, "user_1", true, AT).toSQL().sql).toMatch(/on conflict \("user_id"\) do update set/);
  });

  it("forgets deliveries and sent notifications older than the cutoff, never unsent ones", () => {
    expect(queries.forgetEvents(db, AT).toSQL().sql).toMatch(/^delete from "webhook_events" where "webhook_events"\."received_at" < \$1/);
    const sent = queries.forgetSent(db, AT).toSQL().sql;
    expect(sent).toMatch(/"sent_at" is not null/);
    expect(sent).toMatch(/"sent_at" < \$\d+/);
  });
});
```

- [ ] **Step 3: Run the tests to make sure they fail**

Run: `pnpm test tests/unit/services-env.test.ts tests/unit/store.test.ts tests/unit/neon-store.test.ts`
Expected: FAIL. The three files can't resolve `@/lib/services-env`, `@/lib/db/memory-store` and `@/lib/db/neon-store`.

- [ ] **Step 4: Write the settings and the store**

Create `src/lib/services-env.ts`:

```ts
import "server-only";
import { z } from "zod";

const ServicesSchema = z.object({
  DB_MODE: z.enum(["memory", "neon"]).default("memory"),
  DATABASE_URL: z.string().optional(),
  WEBHOOK_ENCRYPTION_KEY: z.string().optional(),
  EMAIL_MODE: z.enum(["log", "resend"]).default("log"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  NOTIFY_QUIET_SECONDS: z.coerce.number().int().min(0).max(3600).default(120),
  VERCEL: z.string().optional(),
});

/** The database, webhook secret, email and cron settings (M4c). Server-only: none of these may reach the browser. */
export type ServicesEnv = {
  dbMode: "memory" | "neon";
  databaseUrl: string | null;
  /** 32 bytes for AES-256-GCM, or null when unset (the in-memory store then uses a key that lives as long as the process). */
  encryptionKey: Buffer | null;
  emailMode: "log" | "resend";
  resend: { apiKey: string; from: string } | null;
  cronSecret: string | null;
  notifyQuietMs: number;
};

export function parseServicesEnv(source: Record<string, string | undefined>): ServicesEnv {
  const cleaned = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value === "" ? undefined : value]));
  const env = ServicesSchema.parse(cleaned);

  if (env.DB_MODE === "memory" && env.VERCEL === "1") {
    throw new Error("DB_MODE=memory keeps data in one server's memory and is refused on Vercel. Set DB_MODE=neon and DATABASE_URL.");
  }
  if (env.DB_MODE === "neon" && !env.DATABASE_URL) throw new Error("DB_MODE=neon needs DATABASE_URL.");

  let encryptionKey: Buffer | null = null;
  if (env.WEBHOOK_ENCRYPTION_KEY) {
    encryptionKey = Buffer.from(env.WEBHOOK_ENCRYPTION_KEY, "base64");
    if (encryptionKey.length !== 32) throw new Error("WEBHOOK_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).");
  }

  if (env.EMAIL_MODE === "resend" && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) {
    throw new Error("EMAIL_MODE=resend needs RESEND_API_KEY and EMAIL_FROM.");
  }

  return {
    dbMode: env.DB_MODE,
    databaseUrl: env.DATABASE_URL ?? null,
    encryptionKey,
    emailMode: env.EMAIL_MODE,
    resend: env.EMAIL_MODE === "resend" && env.RESEND_API_KEY && env.EMAIL_FROM ? { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM } : null,
    cronSecret: env.CRON_SECRET ?? null,
    notifyQuietMs: env.NOTIFY_QUIET_SECONDS * 1000,
  };
}

/** Parsed on every call, like serverEnv(), so tests and runtime always see the current environment. */
export function servicesEnv(): ServicesEnv {
  return parseServicesEnv(process.env);
}
```

Create `src/lib/db/store.ts`:

```ts
export type Audience = "reviewers" | "admins";

/** One email-worthy event (design §10), from the delivery that caused it; sent once, with others for the same audience. */
export type StoredNotification = { eventId: string; kind: string; audience: Audience; data: Record<string, unknown>; createdAt: Date };

/** This portal's webhook registration: the address the engine calls and its signing secret, encrypted (design §11). */
export type WebhookConfig = { url: string; secretCipher: string; updatedAt: Date };

/** What the dashboard keeps (design §4 "Small database"): in memory locally, in Neon Postgres on Vercel. */
export interface AppStore {
  /** Whether this X-Event-Id was handled already. */
  hasEvent(id: string): Promise<boolean>;
  /** Records a handled delivery and the notification it causes, together; each is a no-op if it's already there. */
  recordEvent(event: { id: string; event: string; receivedAt: Date }, notification: StoredNotification | null): Promise<void>;
  lastEventAt(): Promise<Date | null>;
  webhook(): Promise<WebhookConfig | null>;
  saveWebhook(config: WebhookConfig): Promise<void>;
  /** Notifications not emailed yet, oldest first. */
  pendingNotifications(): Promise<StoredNotification[]>;
  markSent(eventIds: string[], recipients: string[], at: Date): Promise<void>;
  /** Forgets deliveries received, and notifications sent, before `cutoff` (design §4: event ids are kept 30 days). */
  forgetBefore(cutoff: Date): Promise<void>;
  /** The people (by user id) who turned their notification emails off. */
  emailOffUsers(): Promise<Set<string>>;
  setEmailOff(userId: string, off: boolean, at: Date): Promise<void>;
}
```

Create `src/lib/db/schema.ts`:

```ts
import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { Audience } from "./store";

// Design §4: the dashboard's only database. Articles, keywords, photos and schedules stay in Quantum1st's engine.
const at = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Webhook deliveries already handled, by X-Event-Id (kept 30 days). */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  receivedAt: at("received_at").notNull(),
});

/** The one webhook registration (row id 1): our address and the signing secret, encrypted. */
export const webhookConfig = pgTable("webhook_config", {
  id: integer("id").primaryKey(),
  url: text("url").notNull(),
  secretCipher: text("secret_cipher").notNull(),
  updatedAt: at("updated_at").notNull(),
});

/** The notification log: one row per delivery that emails someone; sent_at stays null until it goes out. */
export const notifications = pgTable("notifications", {
  eventId: text("event_id").primaryKey(),
  kind: text("kind").notNull(),
  audience: text("audience").$type<Audience>().notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: at("created_at").notNull(),
  sentAt: at("sent_at"),
  recipients: jsonb("recipients").$type<string[]>(),
});

/** Each person's choice: notification emails are on unless they turned them off. */
export const notificationPrefs = pgTable("notification_prefs", {
  userId: text("user_id").primaryKey(),
  emailOff: boolean("email_off").notNull(),
  updatedAt: at("updated_at").notNull(),
});
```

Create `src/lib/db/memory-store.ts`:

```ts
import type { AppStore, StoredNotification, WebhookConfig } from "./store";

type Logged = StoredNotification & { sentAt: Date | null; recipients: string[] | null };

const copyOf = (item: StoredNotification): StoredNotification => ({
  eventId: item.eventId,
  kind: item.kind,
  audience: item.audience,
  data: structuredClone(item.data),
  createdAt: new Date(item.createdAt),
});

/** DB_MODE=memory: the store in this server process's memory (local development and the e2e suite; refused on Vercel). */
export function createMemoryStore(): AppStore {
  const events = new Map<string, { event: string; receivedAt: Date }>();
  const notifications = new Map<string, Logged>();
  const emailOff = new Set<string>();
  let webhook: WebhookConfig | null = null;

  return {
    async hasEvent(id) {
      return events.has(id);
    },

    async recordEvent(event, notification) {
      if (notification && !notifications.has(notification.eventId)) {
        notifications.set(notification.eventId, { ...copyOf(notification), sentAt: null, recipients: null });
      }
      if (!events.has(event.id)) events.set(event.id, { event: event.event, receivedAt: new Date(event.receivedAt) });
    },

    async lastEventAt() {
      let last: Date | null = null;
      for (const { receivedAt } of events.values()) if (!last || receivedAt > last) last = receivedAt;
      return last ? new Date(last) : null;
    },

    async webhook() {
      return webhook && { ...webhook, updatedAt: new Date(webhook.updatedAt) };
    },

    async saveWebhook(config) {
      webhook = { ...config, updatedAt: new Date(config.updatedAt) };
    },

    async pendingNotifications() {
      return [...notifications.values()]
        .filter((item) => item.sentAt === null)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(copyOf);
    },

    async markSent(eventIds, recipients, at) {
      for (const id of eventIds) {
        const item = notifications.get(id);
        if (item && item.sentAt === null) {
          item.sentAt = new Date(at);
          item.recipients = [...recipients];
        }
      }
    },

    async forgetBefore(cutoff) {
      for (const [id, event] of events) if (event.receivedAt < cutoff) events.delete(id);
      for (const [id, item] of notifications) if (item.sentAt && item.sentAt < cutoff) notifications.delete(id);
    },

    async emailOffUsers() {
      return new Set(emailOff);
    },

    async setEmailOff(userId, off) {
      if (off) emailOff.add(userId);
      else emailOff.delete(userId);
    },
  };
}
```

Create `src/lib/db/neon-store.ts`:

```ts
import { and, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import type { AppStore, StoredNotification, WebhookConfig } from "./store";

export type Db = NeonHttpDatabase<typeof schema>;
const WEBHOOK_ROW = 1;
const { webhookEvents, webhookConfig, notifications, notificationPrefs } = schema;

/** The queries, kept apart from running them so tests can read the SQL they make (no database runs locally). */
export const queries = {
  hasEvent: (db: Db, id: string) => db.select({ id: webhookEvents.id }).from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1),
  insertNotification: (db: Db, item: StoredNotification) =>
    db
      .insert(notifications)
      .values({ eventId: item.eventId, kind: item.kind, audience: item.audience, data: item.data, createdAt: item.createdAt })
      .onConflictDoNothing(),
  insertEvent: (db: Db, event: { id: string; event: string; receivedAt: Date }) => db.insert(webhookEvents).values(event).onConflictDoNothing(),
  lastEventAt: (db: Db) => db.select({ at: webhookEvents.receivedAt }).from(webhookEvents).orderBy(desc(webhookEvents.receivedAt)).limit(1),
  webhook: (db: Db) => db.select().from(webhookConfig).where(eq(webhookConfig.id, WEBHOOK_ROW)).limit(1),
  saveWebhook: (db: Db, config: WebhookConfig) =>
    db
      .insert(webhookConfig)
      .values({ id: WEBHOOK_ROW, ...config })
      .onConflictDoUpdate({ target: webhookConfig.id, set: { url: config.url, secretCipher: config.secretCipher, updatedAt: config.updatedAt } }),
  pending: (db: Db) => db.select().from(notifications).where(isNull(notifications.sentAt)).orderBy(notifications.createdAt),
  markSent: (db: Db, eventIds: string[], recipients: string[], at: Date) =>
    db
      .update(notifications)
      .set({ sentAt: at, recipients })
      .where(and(inArray(notifications.eventId, eventIds), isNull(notifications.sentAt))),
  forgetEvents: (db: Db, cutoff: Date) => db.delete(webhookEvents).where(lt(webhookEvents.receivedAt, cutoff)),
  forgetSent: (db: Db, cutoff: Date) => db.delete(notifications).where(and(isNotNull(notifications.sentAt), lt(notifications.sentAt, cutoff))),
  emailOffUsers: (db: Db) => db.select({ userId: notificationPrefs.userId }).from(notificationPrefs).where(eq(notificationPrefs.emailOff, true)),
  setEmailOff: (db: Db, userId: string, off: boolean, at: Date) =>
    db
      .insert(notificationPrefs)
      .values({ userId, emailOff: off, updatedAt: at })
      .onConflictDoUpdate({ target: notificationPrefs.userId, set: { emailOff: off, updatedAt: at } }),
};

/** DB_MODE=neon: Neon Postgres over HTTP (design §4, D14). Apply the migrations in ./drizzle first (pnpm db:migrate). */
export function createNeonStore(db: Db): AppStore {
  return {
    async hasEvent(id) {
      return (await queries.hasEvent(db, id)).length > 0;
    },

    async recordEvent(event, notification) {
      // One round trip in one transaction: the notification and the event id land together or not at all.
      if (notification) await db.batch([queries.insertNotification(db, notification), queries.insertEvent(db, event)]);
      else await queries.insertEvent(db, event);
    },

    async lastEventAt() {
      return (await queries.lastEventAt(db))[0]?.at ?? null;
    },

    async webhook() {
      const row = (await queries.webhook(db))[0];
      return row ? { url: row.url, secretCipher: row.secretCipher, updatedAt: row.updatedAt } : null;
    },

    async saveWebhook(config) {
      await queries.saveWebhook(db, config);
    },

    async pendingNotifications() {
      return (await queries.pending(db)).map((row) => ({
        eventId: row.eventId,
        kind: row.kind,
        audience: row.audience,
        data: row.data,
        createdAt: row.createdAt,
      }));
    },

    async markSent(eventIds, recipients, at) {
      if (eventIds.length > 0) await queries.markSent(db, eventIds, recipients, at);
    },

    async forgetBefore(cutoff) {
      await db.batch([queries.forgetEvents(db, cutoff), queries.forgetSent(db, cutoff)]);
    },

    async emailOffUsers() {
      return new Set((await queries.emailOffUsers(db)).map((row) => row.userId));
    },

    async setEmailOff(userId, off, at) {
      await queries.setEmailOff(db, userId, off, at);
    },
  };
}
```

Create `src/lib/db/index.ts`:

```ts
import "server-only";
import { drizzle } from "drizzle-orm/neon-http";
import { servicesEnv } from "@/lib/services-env";
import { createMemoryStore } from "./memory-store";
import { createNeonStore } from "./neon-store";
import * as schema from "./schema";
import type { AppStore } from "./store";

const MEMORY = Symbol.for("articles-ai.memory-store");
let neon: { url: string; store: AppStore } | null = null;

/** The dashboard's store: Neon Postgres (DB_MODE=neon), or one in-memory store per server process (local only). */
export function getStore(): AppStore {
  const env = servicesEnv();
  if (env.dbMode === "memory") {
    const holder = globalThis as unknown as Record<symbol, AppStore | undefined>;
    return (holder[MEMORY] ??= createMemoryStore());
  }
  const url = env.databaseUrl ?? "";
  if (neon?.url !== url) neon = { url, store: createNeonStore(drizzle(url, { schema })) };
  return neon.store;
}
```

Create `drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

// pnpm db:generate writes a migration from the schema; pnpm db:migrate applies them to DATABASE_URL (Neon).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
```

Append to `.env.example`:

```bash

# Dashboard storage (design §4): "memory" keeps it in this server's memory (local only, refused on Vercel);
# "neon" = Neon Postgres (Vercel Marketplace adds DATABASE_URL). Apply migrations with: pnpm db:migrate
DB_MODE=memory
DATABASE_URL=
# 32 random bytes, base64 (openssl rand -base64 32): encrypts the webhook secret. Required with DB_MODE=neon.
WEBHOOK_ENCRYPTION_KEY=
```

- [ ] **Step 5: Generate the first migration**

Run: `pnpm db:generate`
Expected:
- drizzle-kit writes `drizzle/0000_<words>.sql` and `drizzle/meta/`.
- The SQL creates `webhook_events`, `webhook_config`, `notifications` and `notification_prefs`.
- Check with `grep -c "CREATE TABLE" drizzle/0000_*.sql`, which prints 4.

If drizzle-kit can't load `src/lib/db/schema.ts` because of its type import, ledger a ruling and inline the `Audience` type in the schema.

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `pnpm test tests/unit/services-env.test.ts tests/unit/store.test.ts tests/unit/neon-store.test.ts`
Expected: PASS (5 + 4 + 4 tests). If a SQL pattern in `neon-store.test.ts` differs from drizzle's real output only in spacing or quoting, read the actual `toSQL()` output. Adjust the pattern to the same meaning (for example `"sent_at" is null`), and ledger a ruling.

- [ ] **Step 7: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: exit 0; every unit test passes.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml drizzle.config.ts drizzle .env.example src/lib/services-env.ts src/lib/db tests/unit/services-env.test.ts tests/unit/store.test.ts tests/unit/neon-store.test.ts
git commit -m "feat: the dashboard's store: in memory locally, Neon Postgres through Drizzle on Vercel"
```

---

### Task 2: The webhook secret, signatures, and which events email whom

**Files:**
- Create: `src/lib/webhooks/secret.ts`, `src/lib/webhooks/signature.ts`, `src/lib/webhooks/events.ts`
- Test: `tests/unit/webhooks.test.ts` (create)

**Interfaces:**
- Consumes: Task 1 `Audience`, `StoredNotification`, `ServicesEnv`
- Produces:
  - **`secret.ts`:**
    - `encryptSecret(secret, key)` → `"v1:…"`
    - `decryptSecret(stored, key)` → `string | null`
    - `secretKeyFor({ dbMode, encryptionKey })` → `Buffer | null`
  - **`signature.ts`:**
    - `signBody(body, secret)` → `"sha256=<hex>"`
    - `verifySignature(body, header, secret)` → `boolean`
  - **`events.ts`:**
    - `WEBHOOK_EVENTS` (12), `EVENT_ID` (regex)
    - `EnvelopeSchema` / `Envelope`
    - `NotificationKind` (`"drafted" | "failed" | "connection" | "quotaWarning" | "quotaExceeded" | "scan"`)
    - `notificationFor(eventId, envelope, now)` → `StoredNotification | null`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/webhooks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { notificationFor, WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { decryptSecret, encryptSecret, secretKeyFor } from "@/lib/webhooks/secret";
import { signBody, verifySignature } from "@/lib/webhooks/signature";

const KEY = Buffer.alloc(32, 1);
const NOW = new Date("2026-10-22T08:00:00Z");
const envelope = (event: string, data: unknown) => ({ event, siteId: "site_12", at: "2026-10-22T12:00:00+04:00", data });

describe("the webhook secret at rest (design §11)", () => {
  it("encrypts so the stored text never contains the secret, and decrypts with the same key", () => {
    const stored = encryptSecret("whsec_abc123", KEY);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain("whsec_abc123");
    expect(encryptSecret("whsec_abc123", KEY)).not.toBe(stored); // a fresh IV each time
    expect(decryptSecret(stored, KEY)).toBe("whsec_abc123");
  });

  it("gives nothing back for another key or altered text (Review Focus 3)", () => {
    const stored = encryptSecret("whsec_abc123", KEY);
    expect(decryptSecret(stored, Buffer.alloc(32, 2))).toBeNull();
    expect(decryptSecret(`${stored.slice(0, -4)}${stored.endsWith("AAAA") ? "BBBB" : "AAAA"}`, KEY)).toBeNull();
    expect(decryptSecret("plain", KEY)).toBeNull();
  });

  it("uses WEBHOOK_ENCRYPTION_KEY, or one key per process with the in-memory store, and none for Neon without it", () => {
    expect(secretKeyFor({ dbMode: "neon", encryptionKey: KEY })).toBe(KEY);
    expect(secretKeyFor({ dbMode: "neon", encryptionKey: null })).toBeNull();
    const memory = secretKeyFor({ dbMode: "memory", encryptionKey: null });
    expect(memory?.length).toBe(32);
    expect(secretKeyFor({ dbMode: "memory", encryptionKey: null })).toBe(memory);
  });
});

describe("signatures (spec v1.1 §8: X-Signature: sha256=<HMAC of raw body>)", () => {
  const body = JSON.stringify(envelope("post.drafted", { postId: "p_1", status: "pending" }));

  it("accepts the hex HMAC of the raw body, in any letter case", () => {
    const header = signBody(body, "whsec_abc123");
    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature(body, header, "whsec_abc123")).toBe(true);
    expect(verifySignature(body, `sha256=${header.slice(7).toUpperCase()}`, "whsec_abc123")).toBe(true);
  });

  it("rejects a wrong secret, a changed body, and a missing or malformed header (Review Focus 1)", () => {
    const header = signBody(body, "whsec_abc123");
    expect(verifySignature(body, header, "whsec_other")).toBe(false);
    expect(verifySignature(`${body} `, header, "whsec_abc123")).toBe(false);
    expect(verifySignature(body, null, "whsec_abc123")).toBe(false);
    expect(verifySignature(body, "sha256=abc", "whsec_abc123")).toBe(false);
  });
});

describe("which events email whom (design §10)", () => {
  it("subscribes to every event spec v1.1 §8 lists", () => {
    expect(WEBHOOK_EVENTS).toHaveLength(12);
    expect(WEBHOOK_EVENTS).toContain("connection.changed");
  });

  it("tells Reviewers about drafts, and the Admin about failures, broken connections, quotas and finished scans", () => {
    expect(notificationFor("evt_1", envelope("post.drafted", { postId: "p_1", status: "pending" }), NOW)).toEqual({
      eventId: "evt_1",
      kind: "drafted",
      audience: "reviewers",
      data: { postId: "p_1" },
      createdAt: NOW,
    });
    expect(notificationFor("evt_2", envelope("post.failed", { postId: "p_2", error: { code: "publish_failed", message: "WordPress refused" } }), NOW)).toMatchObject({
      kind: "failed",
      audience: "admins",
      data: { postId: "p_2", error: "WordPress refused" },
    });
    expect(notificationFor("evt_3", envelope("connection.changed", { type: "linkedin", status: "expiring" }), NOW)).toMatchObject({
      kind: "connection",
      audience: "admins",
      data: { type: "linkedin", status: "expiring" },
    });
    expect(notificationFor("evt_4", envelope("quota.warning", { metric: "articles", used: 36, limit: 40 }), NOW)).toMatchObject({ kind: "quotaWarning", audience: "admins" });
    expect(notificationFor("evt_5", envelope("quota.exceeded", { metric: "articles", used: 40, limit: 40, mode: "hard" }), NOW)).toMatchObject({ kind: "quotaExceeded" });
    expect(notificationFor("evt_6", envelope("site.scan_finished", { findings: 7 }), NOW)).toMatchObject({ kind: "scan", data: { findings: 7 } });
  });

  it("sends nothing for a connection that works again, for events with no email, or for data in an unknown shape", () => {
    expect(notificationFor("evt_7", envelope("connection.changed", { type: "website", status: "ok" }), NOW)).toBeNull();
    expect(notificationFor("evt_8", envelope("post.published", { postId: "p_1", url: "https://x.example", platform: "blog" }), NOW)).toBeNull();
    expect(notificationFor("evt_9", envelope("something.new", {}), NOW)).toBeNull();
    expect(notificationFor("evt_10", envelope("post.drafted", { id: 5 }), NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to make sure it fails**

Run: `pnpm test tests/unit/webhooks.test.ts`
Expected: FAIL to resolve `@/lib/webhooks/events`.

- [ ] **Step 3: Implement**

Create `src/lib/webhooks/secret.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** The webhook secret at rest (design §11): AES-256-GCM, stored as "v1:" + base64(iv | tag | ciphertext). */
export function encryptSecret(secret: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

/** The secret back; null if another key encrypted it (WEBHOOK_ENCRYPTION_KEY changed) or the text was altered. */
export function decryptSecret(stored: string, key: Buffer): string | null {
  if (!stored.startsWith(`${VERSION}:`)) return null;
  const raw = Buffer.from(stored.slice(VERSION.length + 1), "base64");
  if (raw.length <= IV_BYTES + TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const PROCESS_KEY = Symbol.for("articles-ai.process-key");

/**
 * The key for the webhook secret: WEBHOOK_ENCRYPTION_KEY; with the in-memory store, one that lives as long as the
 * process (as the store does); with Neon and no key, none: the secret can't be kept.
 */
export function secretKeyFor(env: { dbMode: "memory" | "neon"; encryptionKey: Buffer | null }): Buffer | null {
  if (env.encryptionKey) return env.encryptionKey;
  if (env.dbMode !== "memory") return null;
  const holder = globalThis as unknown as Record<symbol, Buffer | undefined>;
  return (holder[PROCESS_KEY] ??= randomBytes(32));
}
```

Create `src/lib/webhooks/signature.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/** Spec v1.1 §8: X-Signature is "sha256=" + the hex HMAC-SHA256 of the raw body with the site's webhook secret. */
export function signBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

/** Checks an X-Signature header against the raw body in constant time (design §11). Hex letter case doesn't matter. */
export function verifySignature(body: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(signBody(body, secret), "utf8");
  const given = Buffer.from(header.trim().toLowerCase(), "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

Create `src/lib/webhooks/events.ts`:

```ts
import { z } from "zod";
import type { Audience, StoredNotification } from "@/lib/db/store";

/** Spec v1.1 §8: every event the dashboard subscribes to. */
export const WEBHOOK_EVENTS = [
  "job.finished",
  "post.drafted",
  "post.published",
  "post.failed",
  "suggestions.created",
  "keywords.proposed",
  "connection.changed",
  "performance.refresh_suggested",
  "site.scan_finished",
  "quota.warning",
  "quota.exceeded",
  "plan.changed",
] as const;

/** X-Event-Id ("evt_…"): a safe set of characters, because it becomes a database key. */
export const EVENT_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Spec v1.1 §8 body: { event, siteId, at, data }. */
export const EnvelopeSchema = z.object({ event: z.string().min(1).max(100), siteId: z.string(), at: z.string(), data: z.unknown() });
export type Envelope = z.infer<typeof EnvelopeSchema>;

export const NOTIFICATION_KINDS = ["drafted", "failed", "connection", "quotaWarning", "quotaExceeded", "scan"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const Text = z.string().max(500);
const PostId = z.object({ postId: Text });
const Failed = z.object({ postId: Text, error: z.union([Text, z.object({ message: Text })]).nullish() });
const Connection = z.object({ type: Text, status: Text });
const Quota = z.object({ metric: Text, used: z.number(), limit: z.number() });
const Scan = z.object({ findings: z.number().int().nonnegative() });

/**
 * Design §10: which deliveries email whom. Drafts go to Reviewers; failed posts, connections that aren't "ok", quota
 * warnings and finished scans go to the Admin. Other events need no email: every screen reads the engine when it opens.
 * Data in a shape the dashboard doesn't know sends nothing. Null: no email.
 */
export function notificationFor(eventId: string, envelope: Envelope, now: Date): StoredNotification | null {
  const make = (kind: NotificationKind, audience: Audience, data: Record<string, unknown>): StoredNotification => ({ eventId, kind, audience, data, createdAt: now });
  switch (envelope.event) {
    case "post.drafted": {
      const parsed = PostId.safeParse(envelope.data);
      return parsed.success ? make("drafted", "reviewers", { postId: parsed.data.postId }) : null;
    }
    case "post.failed": {
      const parsed = Failed.safeParse(envelope.data);
      if (!parsed.success) return null;
      const error = typeof parsed.data.error === "string" ? parsed.data.error : (parsed.data.error?.message ?? null);
      return make("failed", "admins", { postId: parsed.data.postId, error });
    }
    case "connection.changed": {
      const parsed = Connection.safeParse(envelope.data);
      return parsed.success && parsed.data.status !== "ok" ? make("connection", "admins", { type: parsed.data.type, status: parsed.data.status }) : null;
    }
    case "quota.warning":
    case "quota.exceeded": {
      const parsed = Quota.safeParse(envelope.data);
      if (!parsed.success) return null;
      return make(envelope.event === "quota.warning" ? "quotaWarning" : "quotaExceeded", "admins", {
        metric: parsed.data.metric,
        used: parsed.data.used,
        limit: parsed.data.limit,
      });
    }
    case "site.scan_finished": {
      const parsed = Scan.safeParse(envelope.data);
      return parsed.success ? make("scan", "admins", { findings: parsed.data.findings }) : null;
    }
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `pnpm test tests/unit/webhooks.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: exit 0; every unit test passes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/webhooks tests/unit/webhooks.test.ts
git commit -m "feat: webhook secret encryption, signature checks, and which events email whom"
```

---

### Task 3: The engine's webhook registration, and signed deliveries from the mock engine

**Files:**
- Create: `src/lib/engine/mock/deliver.ts`, `src/app/api/dev/mock-webhook/route.ts`
- Modify:
  - `src/lib/engine/schemas.ts`, `src/lib/engine/api.ts`
  - `src/lib/engine/mock/settings-store.ts`, `src/lib/engine/mock/server.ts`
- Test: `tests/unit/engine-webhook.test.ts` (create)

**Interfaces:**
- Consumes:
  - Task 2: `signBody`, `EVENT_ID`
  - M2a/M3b: `ChangeContext`, `createMockStore`, `mockStoreFor`, `MOCK_STORE_COOKIE`, `serverEnv`
- Produces:
  - **Engine methods:**
    - `engine.webhookSettings()` → `{ url: string | null | undefined; events: string[] }` (a secret in the response is dropped)
    - `engine.saveWebhook({ url, events, rotateSecret }, ctx)` → `{ url, events, secret?: string }`
  - **Mock settings store:**
    - `store.settings.webhook()`, `saveWebhook(body)`
    - `webhookTarget()` → `{ url, secret } | null`
  - **`deliverMockEvent(store, event, data, { eventId?, fetch? })`:** returns `{ delivered: true, eventId, status, body }` or `{ delivered: false, reason: "no_webhook" }`
  - **`POST /api/dev/mock-webhook`:**
    - takes `{ event, data, eventId? }`
    - answers `{ ok: true, data: <deliverMockEvent result> }`
    - test logins with the mock engine only

- [ ] **Step 1: Write the failing test**

Create `tests/unit/engine-webhook.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createEngineApi } from "@/lib/engine/api";
import { createEngineClient } from "@/lib/engine/client";
import { deliverMockEvent } from "@/lib/engine/mock/deliver";
import { createMockFetch } from "@/lib/engine/mock/server";
import { createMockStore } from "@/lib/engine/mock/store";
import { verifySignature } from "@/lib/webhooks/signature";
import { fakeEngine } from "./fake-engine";

const BASE = "https://mock.engine.local/api/v1";
const HOOK = "https://portal.example/api/hooks/marketing";
const ctx = (n: number) => ({ actingUser: "admin@example.com", idempotencyKey: `key-${n}-2345678` });

function mockEngine() {
  const store = createMockStore();
  const fetch = createMockFetch({ baseUrl: BASE, apiKey: "mock-key", store });
  return { store, engine: createEngineApi(createEngineClient({ baseUrl: BASE, apiKey: "mock-key", fetch, retryDelaysMs: [0, 0] })) };
}

describe("the webhook registration (spec v1.1 §7 GET/PUT …/webhook)", () => {
  it("reads and saves it on the site; a secret in a GET answer is dropped", async () => {
    const { engine, calls } = fakeEngine({
      "GET /sites/site_1/webhook": { url: HOOK, events: ["post.drafted"], secret: "leaked" },
      "PUT /sites/site_1/webhook": { url: HOOK, events: ["post.drafted"], secret: "whsec_1" },
    });
    expect(await engine.webhookSettings()).toEqual({ url: HOOK, events: ["post.drafted"] });
    expect(await engine.saveWebhook({ url: HOOK, events: ["post.drafted"], rotateSecret: true }, ctx(1))).toEqual({
      url: HOOK,
      events: ["post.drafted"],
      secret: "whsec_1",
    });
    expect(calls.at(-1)).toMatchObject({ method: "PUT", path: "/sites/site_1/webhook", body: { url: HOOK, events: ["post.drafted"], rotateSecret: true } });
  });

  it("the mock engine returns the secret once, on the first save or a rotation, and never from GET", async () => {
    const { engine } = mockEngine();
    expect(await engine.webhookSettings()).toEqual({ url: null, events: [] });
    const first = await engine.saveWebhook({ url: HOOK, events: ["post.drafted"], rotateSecret: false }, ctx(1));
    expect(first.secret).toMatch(/^whsec_/);
    const again = await engine.saveWebhook({ url: HOOK, events: ["post.drafted", "post.failed"], rotateSecret: false }, ctx(2));
    expect(again.secret).toBeUndefined();
    const rotated = await engine.saveWebhook({ url: HOOK, events: ["post.drafted"], rotateSecret: true }, ctx(3));
    expect(rotated.secret).toMatch(/^whsec_/);
    expect(rotated.secret).not.toBe(first.secret);
    expect(await engine.webhookSettings()).toEqual({ url: HOOK, events: ["post.drafted"] });
  });

  it("the mock engine refuses an address that isn't a web address, and an empty event list", async () => {
    const { engine } = mockEngine();
    await expect(engine.saveWebhook({ url: "ftp://x.example", events: [], rotateSecret: true }, ctx(1))).rejects.toMatchObject({
      code: "invalid_input",
      fields: { url: expect.any(String), events: expect.any(String) },
    });
  });
});

describe("deliveries from the mock engine (test logins only)", () => {
  it("signs the raw body with the registered secret and sends the event id", async () => {
    const { store, engine } = mockEngine();
    const saved = await engine.saveWebhook({ url: HOOK, events: ["post.drafted"], rotateSecret: true }, ctx(1));
    const sent: { url: string; init: RequestInit }[] = [];
    const result = await deliverMockEvent(store, "post.drafted", { postId: "p_1", status: "pending" }, {
      eventId: "evt_test",
      fetch: async (url, init) => {
        sent.push({ url, init });
        return Response.json({ ok: true, data: { received: true } });
      },
    });
    expect(result).toEqual({ delivered: true, eventId: "evt_test", status: 200, body: { ok: true, data: { received: true } } });
    const headers = new Headers(sent[0].init.headers);
    expect([sent[0].url, headers.get("X-Event-Id")]).toEqual([HOOK, "evt_test"]);
    expect(verifySignature(String(sent[0].init.body), headers.get("X-Signature"), saved.secret ?? "")).toBe(true);
    expect(JSON.parse(String(sent[0].init.body))).toMatchObject({ event: "post.drafted", siteId: "site_fakher", data: { postId: "p_1" } });
  });

  it("delivers nothing before a webhook is set up", async () => {
    const { store } = mockEngine();
    expect(await deliverMockEvent(store, "post.drafted", {})).toEqual({ delivered: false, reason: "no_webhook" });
  });
});
```

- [ ] **Step 2: Run the test to make sure it fails**

Run: `pnpm test tests/unit/engine-webhook.test.ts`
Expected: FAIL to resolve `@/lib/engine/mock/deliver`.

- [ ] **Step 3: Add the engine methods and the mock registration**

In `src/lib/engine/schemas.ts`, append:

```ts
// ── Webhook (spec v1.1 §7 GET / PUT …/webhook; §8) ──

/** GET …/webhook: where the engine sends deliveries, and which events. A secret is never read from a GET answer. */
export const WebhookSettingsSchema = z.object({ url: z.string().nullish(), events: z.array(z.string()).default([]) });
export type WebhookSettings = z.infer<typeof WebhookSettingsSchema>;

/** PUT …/webhook: the secret comes back only on the first save, or when rotateSecret is true. */
export const WebhookSavedSchema = WebhookSettingsSchema.extend({ secret: z.string().optional() });
export type WebhookSaved = z.infer<typeof WebhookSavedSchema>;
```

In `src/lib/engine/api.ts`:
- Add `WebhookSavedSchema,` and `WebhookSettingsSchema,` to the import from `./schemas`, in alphabetical order.
- Before `return {` at the end of `createEngineApi`, add:

  ```ts
    /** Spec v1.1 §7 GET …/webhook. */
    const webhookSettings = async () => (await client.request({ method: "GET", path: `${await sitePath()}/webhook`, schema: WebhookSettingsSchema })).data;

    /** Spec v1.1 §7 PUT …/webhook: one webhook per portal deployment; rotateSecret asks for a new signing secret. */
    const saveWebhook = async (update: { url: string; events: readonly string[]; rotateSecret: boolean }, ctx: ChangeContext) =>
      (await client.request({ method: "PUT", path: `${await sitePath()}/webhook`, schema: WebhookSavedSchema, body: update, ...ctx })).data;
  ```

- Add `webhookSettings,` and `saveWebhook,` to the returned object, after `usage,`.

In `src/lib/engine/mock/settings-store.ts`, inside `createSettingsStore`:
- After the line `const passedTests = new Set<string>();`, add:

  ```ts
    let webhook: { url: string | null; events: string[]; secret: string | null } = { url: null, events: [], secret: null };

    /** GET …/webhook: never the secret. */
    const webhookView = () => ok({ url: webhook.url, events: [...webhook.events] });

    /** PUT …/webhook: a new secret on the first save or with rotateSecret, returned only then (spec v1.1 §7). */
    function saveWebhook(input: Record<string, unknown>): MockOutcome<{ url: string; events: string[]; secret?: string }> {
      const url = text(input.url);
      const events = textList(input.events);
      const fields: Record<string, string> = {};
      if (!isWebAddress(url)) fields.url = ADDRESS;
      if (events.length === 0) fields.events = "Choose at least one event.";
      if (Object.keys(fields).length > 0) return invalid(fields);
      const secret = !webhook.secret || input.rotateSecret === true ? `whsec_${crypto.randomUUID().replace(/-/g, "")}` : null;
      webhook = { url, events, secret: secret ?? webhook.secret };
      return ok({ url, events, ...(secret ? { secret } : {}) });
    }

    /** Where, and with which secret, the mock engine signs its deliveries (test logins only). */
    const webhookTarget = () => (webhook.url && webhook.secret ? { url: webhook.url, secret: webhook.secret } : null);
  ```

- In the object it returns, after `disconnectSearchConsole,`, add:

  ```ts
      webhook: webhookView,
      saveWebhook,
      webhookTarget,
  ```

In `src/lib/engine/mock/server.ts`, in `route`, after the line `if (rest === "/settings/social" && method === "GET") return outcome(store.settings.socialList());`, add:

```ts
  if (rest === "/webhook" && method === "GET") return outcome(store.settings.webhook());
  if (rest === "/webhook" && method === "PUT") return outcome(store.settings.saveWebhook(body));
```

- [ ] **Step 4: Write the mock delivery and its route**

Create `src/lib/engine/mock/deliver.ts`:

```ts
import { signBody } from "@/lib/webhooks/signature";
import { MOCK_SITE_ID } from "./fixtures";
import type { MockStore } from "./store";

type Send = (url: string, init: RequestInit) => Promise<Response>;

/** Test logins only: the mock engine sends one signed delivery to the address registered with it, as Quantum1st would (spec v1.1 §8). */
export async function deliverMockEvent(store: MockStore, event: string, data: unknown, options: { eventId?: string; fetch?: Send } = {}) {
  const target = store.settings.webhookTarget();
  if (!target) return { delivered: false as const, reason: "no_webhook" as const };
  const eventId = options.eventId ?? `evt_${crypto.randomUUID().replace(/-/g, "")}`;
  const body = JSON.stringify({ event, siteId: MOCK_SITE_ID, at: new Date().toISOString(), data });
  const send: Send = options.fetch ?? ((url, init) => fetch(url, init));
  const response = await send(target.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature": signBody(body, target.secret), "X-Event-Id": eventId },
    body,
  });
  const reply: unknown = await response.json().catch(() => null);
  return { delivered: true as const, eventId, status: response.status, body: reply };
}
```

Create `src/app/api/dev/mock-webhook/route.ts`:

```ts
import { cookies } from "next/headers";
import { z } from "zod";
import { deliverMockEvent } from "@/lib/engine/mock/deliver";
import { MOCK_STORE_COOKIE, mockStoreFor } from "@/lib/engine/mock/registry";
import { serverEnv } from "@/lib/env";
import { EVENT_ID } from "@/lib/webhooks/events";

const Body = z.object({ event: z.string().min(1).max(100), data: z.unknown(), eventId: z.string().regex(EVENT_ID).optional() });

/**
 * Test logins with the mock engine only: the mock engine (this request's mock_store) delivers one signed event to the
 * address registered with it. The e2e suite and local checks use it; 404 anywhere else.
 */
export async function POST(request: Request) {
  const env = serverEnv();
  if (env.authMode !== "mock" || env.engineMode !== "mock") return new Response(null, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: { status: 400, code: "invalid_input", message: "Send { event, data, eventId? }." } }, { status: 400 });
  }
  const store = mockStoreFor((await cookies()).get(MOCK_STORE_COOKIE)?.value);
  return Response.json({ ok: true, data: await deliverMockEvent(store, parsed.data.event, parsed.data.data, { eventId: parsed.data.eventId }) });
}
```

- [ ] **Step 5: Run the test to make sure it passes**

Run: `pnpm test tests/unit/engine-webhook.test.ts tests/unit/mock-settings.test.ts tests/unit/engine-settings.test.ts`
Expected: PASS (engine-webhook has 5 tests; the settings tests still pass).

- [ ] **Step 6: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: exit 0; every unit test passes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/engine "src/app/api/dev/mock-webhook" tests/unit/engine-webhook.test.ts
git commit -m "feat: the engine's webhook registration, and signed deliveries from the mock engine"
```

---

### Task 4: The webhook receiver

**Files:**
- Create: `src/app/api/hooks/marketing/route.ts`
- Test: `tests/unit/hooks-route.test.ts` (create)

**Interfaces:**
- Consumes:
  - Task 1: `getStore`, `servicesEnv`
  - Task 2: `decryptSecret`, `secretKeyFor`, `verifySignature`, `EnvelopeSchema`, `EVENT_ID`, `notificationFor`
- Produces: **`POST /api/hooks/marketing`** answers:
  - 200 `{ ok: true, data: { received: true } }`
  - 200 `{ ok: true, data: { duplicate: true } }`
  - 401 `invalid_signature`
  - 400 `invalid_input`
  - 413 `too_large`

  It never sets cookies or reads the session: the engine calls it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/hooks-route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/db/memory-store";
import type { AppStore } from "@/lib/db/store";
import { encryptSecret } from "@/lib/webhooks/secret";
import { signBody } from "@/lib/webhooks/signature";

const KEY = Buffer.alloc(32, 9);
const SECRET = "whsec_test";
let store: AppStore;
vi.mock("@/lib/db", () => ({ getStore: () => store }));

const { POST } = await import("@/app/api/hooks/marketing/route");

const drafted = JSON.stringify({ event: "post.drafted", siteId: "site_12", at: "2026-10-22T12:00:00+04:00", data: { postId: "p_1", status: "pending" } });

/** A delivery as the engine sends it: signed with SECRET, event id evt_1, unless the headers say otherwise. */
function deliver(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/hooks/marketing", {
      method: "POST",
      body,
      headers: { "X-Signature": signBody(body, SECRET), "X-Event-Id": "evt_1", ...headers },
    }),
  );
}

beforeEach(async () => {
  vi.stubEnv("DB_MODE", "memory");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("WEBHOOK_ENCRYPTION_KEY", KEY.toString("base64"));
  store = createMemoryStore();
  await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: encryptSecret(SECRET, KEY), updatedAt: new Date() });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/hooks/marketing (spec v1.1 §8, §10; design §11, §14)", () => {
  it("accepts a signed delivery, remembers its id and queues the email it causes", async () => {
    const response = await deliver(drafted);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { received: true } });
    expect(await store.hasEvent("evt_1")).toBe(true);
    expect(await store.pendingNotifications()).toMatchObject([{ eventId: "evt_1", kind: "drafted", audience: "reviewers", data: { postId: "p_1" } }]);
  });

  it("rejects a wrong signature, a body changed after signing, or no signature, and records nothing (Review Focus 1)", async () => {
    const changed = new Request("http://localhost/api/hooks/marketing", {
      method: "POST",
      body: `${drafted} `,
      headers: { "X-Signature": signBody(drafted, SECRET), "X-Event-Id": "evt_1" },
    });
    const unsigned = new Request("http://localhost/api/hooks/marketing", { method: "POST", body: drafted, headers: { "X-Event-Id": "evt_1" } });
    for (const response of [await deliver(drafted, { "X-Signature": signBody(drafted, "whsec_other") }), await POST(changed), await POST(unsigned)]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid_signature" } });
    }
    expect(await store.hasEvent("evt_1")).toBe(false);
    expect(await store.pendingNotifications()).toEqual([]);
  });

  it("acknowledges a repeated X-Event-Id and ignores it: one email, not two (Review Focus 1)", async () => {
    await deliver(drafted);
    const again = await deliver(drafted);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, data: { duplicate: true } });
    expect(await store.pendingNotifications()).toHaveLength(1);
  });

  it("refuses every delivery before a webhook is set up, or when this key can't read the stored secret", async () => {
    store = createMemoryStore();
    expect((await deliver(drafted)).status).toBe(401);
    await store.saveWebhook({ url: "https://portal.example/api/hooks/marketing", secretCipher: encryptSecret(SECRET, Buffer.alloc(32, 3)), updatedAt: new Date() });
    expect((await deliver(drafted)).status).toBe(401);
  });

  it("answers 400 for a missing or malformed event id or a body that isn't a delivery, and 413 for an oversized one", async () => {
    expect((await deliver(drafted, { "X-Event-Id": "" })).status).toBe(400);
    expect((await deliver(drafted, { "X-Event-Id": "evt 1/../x" })).status).toBe(400);
    expect((await deliver("not json")).status).toBe(400);
    expect((await deliver(JSON.stringify({ hello: "world" }))).status).toBe(400);
    expect((await deliver(JSON.stringify({ event: "post.drafted", siteId: "s", at: "t", data: { pad: "x".repeat(300_000) } }))).status).toBe(413);
    expect(await store.pendingNotifications()).toEqual([]);
  });

  it("accepts an event it doesn't know, without an email, so the engine stops retrying", async () => {
    const response = await deliver(JSON.stringify({ event: "something.new", siteId: "site_12", at: "t", data: {} }), { "X-Event-Id": "evt_new" });
    expect(response.status).toBe(200);
    expect(await store.hasEvent("evt_new")).toBe(true);
    expect(await store.pendingNotifications()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to make sure it fails**

Run: `pnpm test tests/unit/hooks-route.test.ts`
Expected: FAIL to resolve `@/app/api/hooks/marketing/route`.

- [ ] **Step 3: Implement**

Create `src/app/api/hooks/marketing/route.ts`:

```ts
import { getStore } from "@/lib/db";
import { servicesEnv } from "@/lib/services-env";
import { EnvelopeSchema, EVENT_ID, notificationFor } from "@/lib/webhooks/events";
import { decryptSecret, secretKeyFor } from "@/lib/webhooks/secret";
import { verifySignature } from "@/lib/webhooks/signature";

const MAX_BODY_BYTES = 256 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

const refuse = (status: number, code: string, message: string) => Response.json({ ok: false, error: { status, code, message } }, { status, headers: NO_STORE });
const accept = (data: Record<string, unknown>) => Response.json({ ok: true, data }, { headers: NO_STORE });

/**
 * POST /api/hooks/marketing: Quantum1st's signed deliveries (spec v1.1 §8; design §4, §11). The signature is checked
 * against the raw body, in constant time, before anything is parsed. A repeated X-Event-Id is acknowledged and ignored.
 * Screens aren't cached (they read the engine when they open), so the only work is recording and queueing emails.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return refuse(413, "too_large", "The delivery is too large.");
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return refuse(413, "too_large", "The delivery is too large.");

  const store = getStore();
  const key = secretKeyFor(servicesEnv());
  const config = await store.webhook();
  const secret = key && config ? decryptSecret(config.secretCipher, key) : null;
  if (!secret || !verifySignature(body, request.headers.get("X-Signature"), secret)) {
    return refuse(401, "invalid_signature", "The signature doesn't match.");
  }

  const eventId = request.headers.get("X-Event-Id") ?? "";
  if (!EVENT_ID.test(eventId)) return refuse(400, "invalid_input", "X-Event-Id is missing or malformed.");
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return refuse(400, "invalid_input", "The body isn't valid JSON.");
  }
  const envelope = EnvelopeSchema.safeParse(json);
  if (!envelope.success) return refuse(400, "invalid_input", "The body isn't a webhook delivery.");

  if (await store.hasEvent(eventId)) return accept({ duplicate: true });
  const now = new Date();
  await store.recordEvent({ id: eventId, event: envelope.data.event, receivedAt: now }, notificationFor(eventId, envelope.data, now));
  return accept({ received: true });
}
```

- [ ] **Step 4: Run the test to make sure it passes**

Run: `pnpm test tests/unit/hooks-route.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: exit 0; every unit test passes.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/hooks/marketing" tests/unit/hooks-route.test.ts
git commit -m "feat: the webhook receiver: signature checked on the raw body, repeated deliveries ignored"
```

---

### Task 5: The Webhook settings page

**Files:**
- Create:
  - `src/lib/webhooks/status.ts`
  - `src/app/[locale]/(app)/settings/webhook/page.tsx`, `src/app/[locale]/(app)/settings/webhook/actions.ts`
  - `src/components/settings/webhook-view.tsx`, `src/components/settings/webhook-board.tsx`
- Modify:
  - `src/components/settings/settings-tabs.tsx`
  - `messages/en.json`, `messages/ar.json`
  - `tests/e2e/helpers.ts`
- Test:
  - create: `tests/unit/webhook-settings.test.ts`, `tests/e2e/settings-webhook.spec.ts`

**Interfaces:**
- Consumes:
  - Tasks 1–3: `getStore`, `servicesEnv`, `encryptSecret`, `decryptSecret`, `secretKeyFor`, `WEBHOOK_EVENTS`, `engine.webhookSettings`, `engine.saveWebhook`, `/api/dev/mock-webhook`
  - M3b: `change`, `originOf`, `SettingsTabs`, `ActionError`, `useEngineAction`
- Produces:
  - **`status.ts`:**
    - `HOOK_PATH` (`"/api/hooks/marketing"`), `hookUrlFor(origin)`
    - `WebhookStatus` (`"off" | "elsewhere" | "secretMissing" | "connected"`)
    - `webhookStatus(registeredUrl, storedUrl, ourUrl)`
  - **`setUpWebhookAction({ locale, idempotencyKey })`:**
    - returns `ActionResult<{ connected: true }>`
    - registers this address for every event, with `rotateSecret: true`
    - stores the secret encrypted
    - errors: `not_configured` (503) when there's no key; `invalid_response` when the engine returns no secret
  - **`/settings/webhook` (Admin)**, with test ids:
    - `webhook-status` (with `data-status`), `webhook-url`, `webhook-last-event`
    - `webhook-set-up`, `webhook-done`, `webhook-not-configured`
  - **Settings tab:** `webhook`
  - **e2e helpers:**
    - `setUpWebhook(page)`
    - `deliverEvent(page, event, data, eventId?)` → the receiver's answer as `{ status, body }`

- [ ] **Step 1: Write the failing e2e test**

In `tests/e2e/helpers.ts`:
- Change the first import line to `import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";`.
- Append:

```ts
/** Settings → Webhook → Set up, as the Admin (the page must be signed in as one). */
export async function setUpWebhook(page: Page): Promise<void> {
  await page.goto("/en/settings/webhook");
  await page.getByTestId("webhook-set-up").click();
  await expect(page.getByTestId("webhook-status")).toHaveAttribute("data-status", "connected");
}

let eventSequence = 0;

/** The mock engine delivers one signed event to the registered address; returns the receiver's answer. */
export async function deliverEvent(page: Page, event: string, data: unknown, eventId?: string): Promise<{ status: number; body: unknown }> {
  const id = eventId ?? `evt_e2e_${Date.now().toString(36)}_${++eventSequence}`;
  const response = await page.request.post("/api/dev/mock-webhook", { data: { event, data, eventId: id } });
  const json = (await response.json()) as { data: { delivered: boolean; status?: number; body?: unknown } };
  expect(json.data.delivered).toBe(true);
  return { status: json.data.status ?? 0, body: json.data.body };
}
```

Create `tests/e2e/settings-webhook.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { deliverEvent, isolateMockStore, setUpWebhook, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("an admin sets up the webhook; a signed delivery is accepted and a repeat is ignored (spec v1.1 §8, §10)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/webhook");
  await expect(page.getByTestId("settings-tab-webhook")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("webhook-status")).toHaveAttribute("data-status", "off");
  await expect(page.getByTestId("webhook-url")).toHaveText("http://localhost:3100/api/hooks/marketing");
  await page.getByTestId("webhook-set-up").click();
  await expect(page.getByTestId("webhook-status")).toHaveAttribute("data-status", "connected");
  await expect(page.getByTestId("webhook-done")).toBeVisible();

  const eventId = `evt_once_${Date.now().toString(36)}`;
  const data = { postId: "p_101", url: "https://fakhernco.com/insights/x", platform: "blog" };
  expect(await deliverEvent(page, "post.published", data, eventId)).toEqual({ status: 200, body: { ok: true, data: { received: true } } });
  expect(await deliverEvent(page, "post.published", data, eventId)).toEqual({ status: 200, body: { ok: true, data: { duplicate: true } } });
  await page.reload();
  await expect(page.getByTestId("webhook-last-event")).toContainText("Last delivery:");
});

test("a delivery with a wrong signature is rejected (spec v1.1 §10; Review Focus 1)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await setUpWebhook(page);
  const response = await page.request.post("/api/hooks/marketing", {
    data: { event: "post.drafted", siteId: "site_fakher", at: "2026-10-22T12:00:00+04:00", data: { postId: "p_201", status: "pending" } },
    headers: { "X-Signature": `sha256=${"0".repeat(64)}`, "X-Event-Id": `evt_forged_${Date.now().toString(36)}` },
  });
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid_signature" } });
});

test("getting a new secret keeps deliveries verified", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await setUpWebhook(page);
  await expect(page.getByTestId("webhook-set-up")).toHaveText("Get a new secret");
  await page.getByTestId("webhook-set-up").click();
  await expect(page.getByTestId("webhook-done")).toBeVisible();
  expect((await deliverEvent(page, "plan.changed", { planId: "pro" })).status).toBe(200);
});

test("a reviewer has no Webhook settings and is sent back", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/settings/webhook");
  await expect(page).toHaveURL(/\/en$/);
});

test("the Webhook page in Arabic", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/ar/settings/webhook");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("webhook-status")).toHaveText("غير مُعدّ. تتحدّث الشاشات عند فتحها، لكن لن يصل بريد إلى أحد.");
  await expect(page.getByTestId("webhook-set-up")).toHaveText("إعداد الويب هوك");
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm e2e tests/e2e/settings-webhook.spec.ts`
Expected: FAIL. `/en/settings/webhook` is a 404, so `webhook-status` isn't found, and `setUpWebhook` can't click `webhook-set-up`. The reviewer test fails on the URL too.

Write this e2e test, and see it fail, before the unit test: `next build` type-checks the test files, so a unit test that imports a module that doesn't exist yet would stop the e2e build.

- [ ] **Step 3: Write the failing unit test**

Create `tests/unit/webhook-settings.test.ts`:

```ts
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

const { setUpWebhookAction } = await import("@/app/[locale]/(app)/settings/webhook/actions");
const key = "key-12345678";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DB_MODE", "memory");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("WEBHOOK_ENCRYPTION_KEY", KEY.toString("base64"));
  store = createMemoryStore();
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

  it("doesn't ask for a secret it couldn't keep: Neon without WEBHOOK_ENCRYPTION_KEY", async () => {
    vi.stubEnv("DB_MODE", "neon");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@host/db");
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
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `pnpm test tests/unit/webhook-settings.test.ts`
Expected: FAIL to resolve `@/lib/webhooks/status`.

- [ ] **Step 5: Write the status, the action, the page and its components**

Create `src/lib/webhooks/status.ts`:

```ts
export const HOOK_PATH = "/api/hooks/marketing";
export const hookUrlFor = (origin: string) => `${origin}${HOOK_PATH}`;

export type WebhookStatus = "off" | "elsewhere" | "secretMissing" | "connected";

/**
 * Off: nothing registered. Elsewhere: registered to another address (another deployment, say). Secret missing:
 * registered here, but this server can't read a secret saved for this address (none stored, another address, or a
 * changed WEBHOOK_ENCRYPTION_KEY). Connected: deliveries to this address can be verified.
 */
export function webhookStatus(registeredUrl: string | null | undefined, storedUrl: string | null, ourUrl: string | null): WebhookStatus {
  if (!registeredUrl) return "off";
  if (!ourUrl || registeredUrl !== ourUrl) return "elsewhere";
  return storedUrl === ourUrl ? "connected" : "secretMissing";
}
```

Create `src/app/[locale]/(app)/settings/webhook/actions.ts`:

```ts
"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { change, IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { getStore } from "@/lib/db";
import { EngineError } from "@/lib/engine/errors";
import { servicesEnv } from "@/lib/services-env";
import { originOf } from "@/lib/settings/addresses";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { encryptSecret, secretKeyFor } from "@/lib/webhooks/secret";
import { hookUrlFor } from "@/lib/webhooks/status";

/**
 * Design §11, spec v1.1 §7–8: registers this portal's address for every event, and keeps the secret the engine returns,
 * encrypted. Every setup asks for a new secret, so the stored one matches the engine's even after another deployment
 * registered itself. The secret never leaves the server.
 */
export async function setUpWebhookAction(input: { locale: string; idempotencyKey: string }): Promise<ActionResult<{ connected: true }>> {
  const parsed = z.object({ locale: Locale, idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, idempotencyKey } = parsed.data;
  return change(
    locale,
    idempotencyKey,
    async ({ engine, ...ctx }) => {
      const origin = originOf(await headers());
      if (!origin) throw new EngineError({ status: 400, code: "invalid_input", message: "This dashboard's address couldn't be read from the request." });
      const key = secretKeyFor(servicesEnv());
      if (!key) throw new EngineError({ status: 503, code: "not_configured", message: "WEBHOOK_ENCRYPTION_KEY isn't set, so the secret can't be stored." });
      const url = hookUrlFor(origin);
      const saved = await engine.saveWebhook({ url, events: WEBHOOK_EVENTS, rotateSecret: true }, ctx);
      if (!saved.secret) throw new EngineError({ status: 200, code: "invalid_response", message: "The engine didn't return a webhook secret." });
      await getStore().saveWebhook({ url, secretCipher: encryptSecret(saved.secret, key), updatedAt: new Date() });
      return { connected: true as const };
    },
    "settings.manage",
  );
}
```

Create `src/components/settings/webhook-view.tsx`:

```tsx
import { headers } from "next/headers";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { servicesEnv } from "@/lib/services-env";
import { originOf } from "@/lib/settings/addresses";
import { decryptSecret, secretKeyFor } from "@/lib/webhooks/secret";
import { hookUrlFor, webhookStatus } from "@/lib/webhooks/status";
import { WebhookBoard } from "./webhook-board";

/** Spec v1.1 §6 /account "Webhook URL setup" (design §5: Settings, Admin): where deliveries go, and whether they can be verified. */
export async function WebhookView({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "settings.manage");
  const engine = await getEngine();
  const [registered, site] = await Promise.all([tryEngine(() => engine.webhookSettings()), tryEngine(() => engine.siteTimezone())]);
  if (!registered.ok) return <EngineNotice error={registered.error} />;

  const store = getStore();
  const [config, lastEventAt] = await Promise.all([store.webhook(), store.lastEventAt()]);
  const key = secretKeyFor(servicesEnv());
  const storedUrl = config && key && decryptSecret(config.secretCipher, key) ? config.url : null;
  const origin = originOf(await headers());
  const ourUrl = origin ? hookUrlFor(origin) : null;
  const timeZone = site.ok ? site.data.timezone : "UTC";

  return (
    <WebhookBoard
      locale={locale}
      status={webhookStatus(registered.data.url, storedUrl, ourUrl)}
      ourUrl={ourUrl}
      registeredUrl={registered.data.url ?? null}
      lastEvent={lastEventAt ? formatDateTime(lastEventAt.toISOString(), { timeZone, locale }) : null}
      canStore={key !== null}
    />
  );
}
```

Create `src/components/settings/webhook-board.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { setUpWebhookAction } from "@/app/[locale]/(app)/settings/webhook/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { WebhookStatus } from "@/lib/webhooks/status";

type Props = { locale: string; status: WebhookStatus; ourUrl: string | null; registeredUrl: string | null; lastEvent: string | null; canStore: boolean };

/** Set up (or move here, or re-key) the one webhook this deployment receives (spec v1.1 §8). */
export function WebhookBoard({ locale, status, ourUrl, registeredUrl, lastEvent, canStore }: Props) {
  const t = useTranslations("Settings.webhook");
  const setUp = useEngineAction(setUpWebhookAction);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);
  const notConfigured = !canStore || error?.code === "not_configured";

  async function run() {
    setError(null);
    setDone(false);
    const result = await setUp.run({ locale });
    if (result.ok) setDone(true);
    else setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t("address")}</p>
          <p data-testid="webhook-url">
            <bdi>{ourUrl ?? t("noAddress")}</bdi>
          </p>
        </div>
        <p data-testid="webhook-status" data-status={status} className={status === "connected" ? "text-ok-fg" : "text-warn-fg"}>
          {t(`status.${status}`, { url: registeredUrl ?? "" })}
        </p>
        <p data-testid="webhook-last-event">{lastEvent ? t("lastEvent", { time: lastEvent }) : t("noEvents")}</p>
        {notConfigured && (
          <p role="alert" data-testid="webhook-not-configured" className="rounded-md bg-bad-bg px-3 py-2 text-bad-fg">
            {t("notConfigured")}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <div>
            <Button data-testid="webhook-set-up" disabled={notConfigured || !ourUrl || setUp.pending} onClick={() => void run()}>
              {t(`setUp.${status}`)}
            </Button>
          </div>
          {status === "connected" && <p className="text-xs text-muted-foreground">{t("rotateHint")}</p>}
        </div>
        {done && (
          <p role="status" data-testid="webhook-done" className="text-ok-fg">
            {t("done")}
          </p>
        )}
        {error && error.code !== "not_configured" && <ActionError error={error} />}
      </CardContent>
    </Card>
  );
}
```

Create `src/app/[locale]/(app)/settings/webhook/page.tsx`:

```tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { WebhookView } from "@/components/settings/webhook-view";
import { asAppLocale } from "@/i18n/locales";

export default async function WebhookSettingsPage({ params }: PageProps<"/[locale]/settings/webhook">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Settings");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <SettingsTabs current="webhook" />
      <Suspense fallback={<SectionSkeleton />}>
        <WebhookView locale={locale} />
      </Suspense>
    </div>
  );
}
```

In `src/components/settings/settings-tabs.tsx`, change `export const SETTINGS_PAGES = ["seo", "schedule", "website", "social"] as const;` to `export const SETTINGS_PAGES = ["seo", "schedule", "website", "social", "webhook"] as const;`.

- [ ] **Step 6: Add the messages**

Merge into `messages/en.json`:
- at `Settings.tabs`: `{ "webhook": "Webhook" }`
- at `Settings`:

```json
{
  "webhook": {
    "title": "Webhook",
    "hint": "The content engine tells this dashboard when drafts are ready, posts fail, connections break or quotas run low, so the right people get an email. Every delivery is signed; the signing secret is kept encrypted on this server.",
    "address": "This dashboard's address for deliveries",
    "noAddress": "This dashboard's address couldn't be read from the request.",
    "status": {
      "off": "Not set up. Screens still update when you open them, but nobody gets emails.",
      "elsewhere": "Registered to another address: {url}. Setting it up here moves it, and that address stops getting deliveries.",
      "secretMissing": "Registered here, but this server can't read the signing secret, so deliveries are refused. Get a new secret.",
      "connected": "Set up. Deliveries to this address are checked against the signing secret."
    },
    "lastEvent": "Last delivery: {time}",
    "noEvents": "No deliveries yet",
    "setUp": {
      "off": "Set up webhook",
      "elsewhere": "Move the webhook here",
      "secretMissing": "Get a new secret",
      "connected": "Get a new secret"
    },
    "rotateHint": "A new secret replaces the old one straight away.",
    "done": "Webhook set up. Deliveries are now signed with the new secret.",
    "notConfigured": "This server can't store the signing secret: WEBHOOK_ENCRYPTION_KEY isn't set."
  }
}
```

Merge into `messages/ar.json`:
- at `Settings.tabs`: `{ "webhook": "الويب هوك" }`
- at `Settings`:

```json
{
  "webhook": {
    "title": "الويب هوك (Webhook)",
    "hint": "يُبلغ محرك المحتوى لوحة التحكم هذه عند جاهزية المسودات أو فشل النشر أو تعطّل الاتصالات أو اقتراب نفاد الحصص، ليصل البريد إلى الأشخاص المعنيين. كل إشعار موقَّع، ويُحفظ مفتاح التوقيع مشفّرًا على هذا الخادم.",
    "address": "عنوان لوحة التحكم هذه لاستقبال الإشعارات",
    "noAddress": "تعذّرت قراءة عنوان لوحة التحكم هذه من الطلب.",
    "status": {
      "off": "غير مُعدّ. تتحدّث الشاشات عند فتحها، لكن لن يصل بريد إلى أحد.",
      "elsewhere": "مسجّل على عنوان آخر: {url}. إعداده هنا ينقله، ويتوقف ذلك العنوان عن استقبال الإشعارات.",
      "secretMissing": "مسجّل هنا، لكن هذا الخادم لا يستطيع قراءة مفتاح التوقيع، لذا تُرفض الإشعارات. احصل على مفتاح جديد.",
      "connected": "مُعدّ. تُتحقّق الإشعارات الواردة إلى هذا العنوان بمفتاح التوقيع."
    },
    "lastEvent": "آخر إشعار: {time}",
    "noEvents": "لم يصل أي إشعار بعد",
    "setUp": {
      "off": "إعداد الويب هوك",
      "elsewhere": "نقل الويب هوك إلى هنا",
      "secretMissing": "الحصول على مفتاح جديد",
      "connected": "الحصول على مفتاح جديد"
    },
    "rotateHint": "يحلّ المفتاح الجديد محلّ القديم فورًا.",
    "done": "تم إعداد الويب هوك. تُوقَّع الإشعارات الآن بالمفتاح الجديد.",
    "notConfigured": "لا يستطيع هذا الخادم حفظ مفتاح التوقيع: لم يُضبط WEBHOOK_ENCRYPTION_KEY."
  }
}
```

- [ ] **Step 7: Run the unit tests to make sure they pass**

Run: `pnpm test tests/unit/webhook-settings.test.ts tests/unit/messages.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the e2e tests to make sure they pass**

Run: `pnpm e2e tests/e2e/settings-webhook.spec.ts tests/e2e/settings-schedule.spec.ts`
Expected: PASS. The webhook spec has 5 tests; the schedule spec's tab test still passes with the fifth tab.

- [ ] **Step 9: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: exit 0; every unit test passes.

- [ ] **Step 10: Commit**

```bash
git add src/lib/webhooks/status.ts "src/app/[locale]/(app)/settings/webhook" src/components/settings messages tests/unit/webhook-settings.test.ts tests/e2e/settings-webhook.spec.ts tests/e2e/helpers.ts
git commit -m "feat: the Webhook settings page: register this dashboard, keep the secret encrypted"
```

---

### Task 6: Email notifications: grouped, bilingual, sent by the cron

**Files:**
- Create:
  - `src/lib/notifications/batches.ts`, `src/lib/notifications/recipients.ts`, `src/lib/notifications/render.ts`, `src/lib/notifications/mailer.ts`, `src/lib/notifications/flush.ts`
  - `src/app/api/cron/notifications/route.ts`, `src/app/api/dev/outbox/route.ts`
  - `vercel.json`
- Modify:
  - `package.json` (+ lockfile), `.env.example`
  - `messages/en.json`, `messages/ar.json`
  - `playwright.config.ts`, `tests/e2e/constants.ts`, `tests/e2e/helpers.ts`
- Test:
  - create: `tests/unit/notifications.test.ts`, `tests/unit/cron-route.test.ts`, `tests/e2e/notifications.spec.ts`

**Interfaces:**
- Consumes:
  - Task 1: `AppStore`, `StoredNotification`, `Audience`, `getStore`, `servicesEnv`
  - Task 5: `setUpWebhook`, `deliverEvent` (e2e)
  - M4b: `getDirectory`, `DirectoryUser`, `DirectoryError`
  - M1/M4a: `formatNumber`, `settingsPageFor`
- Produces:
  - **`batches.ts`:** `Batch` (`{ audience, items }`); `dueBatches(pending, now, quietMs)` → `Batch[]`
  - **`recipients.ts`:** `Recipient` (`{ userId, email }`); `recipientsFor(audience, users, emailOff)` → `Recipient[]`
  - **`render.ts`:** `escapeHtml(text)`; `renderBatch(batch, origin)` → `{ subject, html, text }`
  - **`mailer.ts`:**
    - `Email` (`{ to, subject, html, text, idempotencyKey }`), `Mailer` (`{ send(email) }`)
    - `createLogMailer()`, which also has `outbox()`
    - `createResendMailer({ apiKey, from }, client?)`
    - `mailerFor(env)`
  - **`flush.ts`:** `flushNotifications({ store, mailer, users, origin, now, quietMs })` → `{ batches, emails, failed }`
  - **Routes:**
    - `GET /api/cron/notifications` (`Authorization: Bearer CRON_SECRET`) → `{ ok: true, data: { batches, emails, failed } }`
    - `GET /api/dev/outbox` (test logins with `EMAIL_MODE=log`) → `{ ok: true, data: Email[] }`
  - **e2e helpers:** `flushEmails(page)`, `readOutbox(page)`, `newEmails(before, after)`, `SentEmail`

- [ ] **Step 1: Add Resend**

Run: `pnpm add resend@6.34.1`

- [ ] **Step 2: Write the failing e2e test**

In `tests/e2e/constants.ts`, append:

```ts
/** Passed to the server as CRON_SECRET; the e2e suite calls the notifications cron with it. */
export const E2E_CRON_SECRET = "e2e-cron-secret";
```

In `playwright.config.ts`:
- Change the constants import to `import { BASE_URL, E2E_CRON_SECRET, E2E_ENGINE_KEY, E2E_PORT } from "./tests/e2e/constants";`.
- In `webServer.env`, add `CRON_SECRET: E2E_CRON_SECRET, NOTIFY_QUIET_SECONDS: "0"` after `ENGINE_API_KEY: E2E_ENGINE_KEY`.

In `tests/e2e/helpers.ts`:
- Change `import { BASE_URL } from "./constants";` to `import { BASE_URL, E2E_CRON_SECRET } from "./constants";`.
- Append:

```ts
export type SentEmail = { to: string; subject: string; html: string; text: string; idempotencyKey: string };

/** Runs the notifications cron now, as Vercel Cron would (the e2e server's quiet period is 0 seconds). */
export async function flushEmails(page: Page): Promise<{ batches: number; emails: number; failed: number }> {
  const response = await page.request.get("/api/cron/notifications", { headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: { batches: number; emails: number; failed: number } }).data;
}

/** The emails EMAIL_MODE=log kept (test logins only). */
export async function readOutbox(page: Page): Promise<SentEmail[]> {
  const response = await page.request.get("/api/dev/outbox");
  expect(response.status()).toBe(200);
  return ((await response.json()) as { data: SentEmail[] }).data;
}

/** The emails in `after` that weren't in `before` (the outbox is shared by every test on the server). */
export function newEmails(before: SentEmail[], after: SentEmail[]): SentEmail[] {
  const seen = new Set(before.map((email) => email.idempotencyKey));
  return after.filter((email) => !seen.has(email.idempotencyKey));
}
```

Create `tests/e2e/notifications.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { deliverEvent, flushEmails, isolateMockStore, newEmails, readOutbox, setUpWebhook, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("drafts and failures become one email per person, grouped, in both languages (design §10; Review Focus 2)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await setUpWebhook(page);
  await flushEmails(page); // anything earlier tests left pending
  const before = await readOutbox(page);

  for (const postId of ["p_201", "p_202", "p_203"]) await deliverEvent(page, "post.drafted", { postId, status: "pending" });
  await deliverEvent(page, "post.failed", { postId: "p_204", error: { code: "publish_failed", message: "WordPress refused the request" } });
  await deliverEvent(page, "post.published", { postId: "p_205", url: "https://fakhernco.com/insights/x", platform: "blog" });
  expect(await flushEmails(page)).toEqual({ batches: 2, emails: 3, failed: 0 });

  const sent = newEmails(before, await readOutbox(page));
  const toReviewer = sent.filter((email) => email.to === "reviewer@example.com");
  expect(toReviewer).toHaveLength(1);
  expect(toReviewer[0].subject).toBe("3 drafts ready for review · 3 مسودات جاهزة للمراجعة");
  expect(toReviewer[0].html).toContain("http://localhost:3100/en/review");
  expect(toReviewer[0].html).toContain("http://localhost:3100/ar/review");
  expect(toReviewer[0].html).toContain('dir="rtl"');

  const toAdmins = sent.filter((email) => email.subject.startsWith("1 update needs your attention"));
  expect(toAdmins.map((email) => email.to).sort()).toEqual(["admin2@example.com", "admin@example.com"]);
  expect(toAdmins[0].text).toContain("1 post failed to publish");

  expect(await flushEmails(page)).toEqual({ batches: 0, emails: 0, failed: 0 });
});

test("the cron refuses a call without its secret", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  expect((await page.request.get("/api/cron/notifications")).status()).toBe(401);
  expect((await page.request.get("/api/cron/notifications", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `pnpm e2e tests/e2e/notifications.spec.ts`
Expected: FAIL. `/api/cron/notifications` is a 404, so `flushEmails` fails on its status check. The 401 test fails too, because it receives 404s.

Write this e2e test, and see it fail, before the unit tests: `next build` type-checks the test files, so a unit test that imports a module that doesn't exist yet would stop the e2e build.

- [ ] **Step 4: Write the failing unit tests**

Create `tests/unit/notifications.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/db/memory-store";
import type { AppStore, Audience, StoredNotification } from "@/lib/db/store";
import { dueBatches } from "@/lib/notifications/batches";
import { flushNotifications } from "@/lib/notifications/flush";
import { createLogMailer, createResendMailer, type Email } from "@/lib/notifications/mailer";
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
  it("sends through Resend with the sender, both bodies and the idempotency key; a refusal throws", async () => {
    const send = vi.fn(async () => ({ error: null as { message: string } | null }));
    const mailer = createResendMailer({ apiKey: "re_x", from: "Articles AI <notifications@fakhernco.com>" }, { emails: { send } });
    await mailer.send({ to: "a@example.com", subject: "S", html: "<p>h</p>", text: "t", idempotencyKey: "k1" });
    expect(send).toHaveBeenCalledWith(
      { from: "Articles AI <notifications@fakhernco.com>", to: "a@example.com", subject: "S", html: "<p>h</p>", text: "t" },
      { idempotencyKey: "k1" },
    );
    send.mockResolvedValueOnce({ error: { message: "Domain not verified" } });
    await expect(mailer.send({ to: "a@example.com", subject: "S", html: "h", text: "t", idempotencyKey: "k2" })).rejects.toThrow("Domain not verified");
  });

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

  it("keeps a batch pending when an email fails; the retry reuses the same keys, so nobody gets it twice (Review Focus 2)", async () => {
    const store = await seeded();
    const first = fakeMailer((to) => to === "admin2@example.com");
    expect(await flushNotifications(options(store, first.mailer, 200))).toEqual({ batches: 2, emails: 2, failed: 1 });
    expect((await store.pendingNotifications()).map((n) => n.eventId)).toEqual(["e4"]);
    const second = fakeMailer();
    expect(await flushNotifications(options(store, second.mailer, 500))).toEqual({ batches: 1, emails: 2, failed: 0 });
    const adminKeys = (attempts: Email[]) => attempts.filter((email) => email.to.startsWith("admin")).map((email) => email.idempotencyKey);
    expect(adminKeys(second.attempts)).toEqual(adminKeys(first.attempts));
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
```

Create `tests/unit/cron-route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@/lib/db/memory-store";
import type { AppStore } from "@/lib/db/store";
import { createLogMailer } from "@/lib/notifications/mailer";
import { DirectoryError } from "@/lib/users/types";

let store: AppStore;
const directory = { list: vi.fn() };
vi.mock("@/lib/db", () => ({ getStore: () => store }));
vi.mock("@/lib/users/directory", () => ({ getDirectory: async () => directory }));

const { GET } = await import("@/app/api/cron/notifications/route");
const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/cron/notifications", { headers: authorization ? { Authorization: authorization } : {} }));
const REVIEWER = { id: "r1", name: "R", email: "reviewer@example.com", role: "reviewer", twoFactor: false, lastSignInAt: null };

async function queueDraft(id: string) {
  await store.recordEvent({ id, event: "post.drafted", receivedAt: new Date() }, { eventId: id, kind: "drafted", audience: "reviewers", data: { postId: "p_1" }, createdAt: new Date() });
}

beforeEach(() => {
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
});
```

- [ ] **Step 5: Run them to make sure they fail**

Run: `pnpm test tests/unit/notifications.test.ts tests/unit/cron-route.test.ts`
Expected: FAIL to resolve `@/lib/notifications/batches` and `@/app/api/cron/notifications/route`.

- [ ] **Step 6: Write the batching, recipients, email, mailers and flush**

Create `src/lib/notifications/batches.ts`:

```ts
import type { Audience, StoredNotification } from "@/lib/db/store";

export type Batch = { audience: Audience; items: StoredNotification[] };

/**
 * Design §10 "grouped per batch": an audience's pending notifications go out together, once nothing new has arrived
 * for `quietMs`. Drafts from one drafting run make one email, not one each.
 */
export function dueBatches(pending: StoredNotification[], now: Date, quietMs: number): Batch[] {
  const byAudience = new Map<Audience, StoredNotification[]>();
  for (const item of pending) byAudience.set(item.audience, [...(byAudience.get(item.audience) ?? []), item]);
  return [...byAudience].flatMap(([audience, items]) => {
    const newest = Math.max(...items.map((item) => item.createdAt.getTime()));
    return now.getTime() - newest >= quietMs ? [{ audience, items }] : [];
  });
}
```

Create `src/lib/notifications/recipients.ts`:

```ts
import type { Audience } from "@/lib/db/store";
import type { DirectoryUser } from "@/lib/users/types";

export type Recipient = { userId: string; email: string };

/**
 * Design §10: drafts go to Reviewers (to the Admins when there are no Reviewers); everything else to the Admins.
 * People without a role never get email; people who turned it off are left out. Each address gets one email.
 */
export function recipientsFor(audience: Audience, users: DirectoryUser[], emailOff: Set<string>): Recipient[] {
  const withRole = (role: "admin" | "reviewer") => users.filter((user) => user.role === role && user.email.trim() !== "");
  const reviewers = withRole("reviewer");
  const people = audience === "reviewers" && reviewers.length > 0 ? reviewers : withRole("admin");
  const seen = new Set<string>();
  return people
    .filter((user) => !emailOff.has(user.id))
    .flatMap((user) => {
      const email = user.email.trim().toLowerCase();
      if (seen.has(email)) return [];
      seen.add(email);
      return [{ userId: user.id, email }];
    });
}
```

Create `src/lib/notifications/render.ts`:

```ts
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import { settingsPageFor } from "@/lib/dashboard/connections";
import { formatNumber } from "@/lib/format/number";
import type { Batch } from "./batches";

const LOCALES = ["en", "ar"] as const;
type Locale = (typeof LOCALES)[number];
const MESSAGES: Record<Locale, AbstractIntlMessages> = { en, ar };

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Text from the engine (statuses, metric names) goes into HTML escaped (Review Focus 4). */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const textOf = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

/** The last item per key: a connection or metric reported twice in a batch shows once, in its latest state. */
function latestBy(items: Batch["items"], key: (data: Record<string, unknown>) => string): Record<string, unknown>[] {
  const latest = new Map<string, Record<string, unknown>>();
  for (const item of items) latest.set(key(item.data), item.data);
  return [...latest.values()];
}

type Line = { text: string; path: string };

function linesFor(batch: Batch, locale: Locale): Line[] {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "Email" });
  const tConnections = createTranslator({ locale, messages: MESSAGES[locale], namespace: "Dashboard.connections" });
  const tMetrics = createTranslator({ locale, messages: MESSAGES[locale], namespace: "Dashboard.quota.metrics" });
  const ofKind = (kind: string) => batch.items.filter((item) => item.kind === kind);
  const counted = (key: string, count: number) => t(key, { count, n: String(count) });
  const metricName = (data: Record<string, unknown>) => {
    const metric = textOf(data.metric);
    return tMetrics.has(metric) ? tMetrics(metric) : metric;
  };
  const amount = (value: unknown) => formatNumber(Number(value) || 0, locale);
  const lines: Line[] = [];

  const drafted = ofKind("drafted").length;
  if (drafted > 0) lines.push({ text: counted("drafted", drafted), path: "/review" });
  const failed = ofKind("failed").length;
  if (failed > 0) lines.push({ text: counted("failed", failed), path: "/history" });
  for (const data of latestBy(ofKind("connection"), (d) => textOf(d.type))) {
    const type = textOf(data.type);
    const status = textOf(data.status);
    lines.push({
      text: t("connection", {
        name: tConnections.has(`names.${type}`) ? tConnections(`names.${type}`) : type,
        status: tConnections.has(`statuses.${status}`) ? tConnections(`statuses.${status}`) : status,
      }),
      path: settingsPageFor(type),
    });
  }
  for (const data of latestBy(ofKind("quotaWarning"), (d) => textOf(d.metric))) {
    lines.push({ text: t("quotaWarning", { metric: metricName(data), used: amount(data.used), limit: amount(data.limit) }), path: "/plan" });
  }
  for (const data of latestBy(ofKind("quotaExceeded"), (d) => textOf(d.metric))) {
    lines.push({ text: t("quotaExceeded", { metric: metricName(data), limit: amount(data.limit) }), path: "/plan" });
  }
  const lastScan = ofKind("scan").at(-1);
  if (lastScan) lines.push({ text: counted("scan", Number(lastScan.data.findings) || 0), path: "/site-health" });
  return lines;
}

/** Design §10: one email per batch, English then Arabic (right to left), linking to both languages of the dashboard. */
export function renderBatch(batch: Batch, origin: string | null): { subject: string; html: string; text: string } {
  const parts = LOCALES.map((locale) => {
    const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "Email" });
    const href = (path: string) => (origin ? `${origin}/${locale}${path}` : null);
    const lines = linesFor(batch, locale).map((line) => ({ text: line.text, href: href(line.path) }));
    const count = batch.audience === "reviewers" ? batch.items.length : lines.length;
    return {
      locale,
      subject: t(`subject.${batch.audience}`, { count, n: String(count) }),
      heading: t(`heading.${batch.audience}`),
      lines,
      footer: t("footer"),
      settings: href("/notifications"),
    };
  });

  const link = (text: string, href: string | null, style = "") => (href ? `<a href="${escapeHtml(href)}"${style}>${escapeHtml(text)}</a>` : escapeHtml(text));
  const html = [
    '<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">',
    parts
      .map(
        (part) =>
          `<div dir="${part.locale === "ar" ? "rtl" : "ltr"}" lang="${part.locale}" style="margin-bottom:24px">` +
          `<p><strong>${escapeHtml(part.heading)}</strong></p>` +
          `<ul>${part.lines.map((line) => `<li>${link(line.text, line.href)}</li>`).join("")}</ul>` +
          `<p style="color:#6b7280;font-size:13px">${link(part.footer, part.settings, ' style="color:#6b7280"')}</p></div>`,
      )
      .join('<hr style="border:none;border-top:1px solid #e5e7eb">'),
    "</body></html>",
  ].join("");
  const text = parts
    .map((part) =>
      [part.heading, "", ...part.lines.map((line) => `- ${line.text}${line.href ? `: ${line.href}` : ""}`), "", `${part.footer}${part.settings ? ` ${part.settings}` : ""}`].join("\n"),
    )
    .join("\n\n———\n\n");
  return { subject: parts.map((part) => part.subject).join(" · "), html, text };
}
```

Create `src/lib/notifications/mailer.ts`:

```ts
import { Resend } from "resend";

export type Email = { to: string; subject: string; html: string; text: string; idempotencyKey: string };
export interface Mailer {
  send(email: Email): Promise<void>;
}

const OUTBOX = Symbol.for("articles-ai.outbox");
const OUTBOX_SIZE = 100;

/** EMAIL_MODE=log: nothing leaves the server; the last 100 emails are kept for the dev outbox (test logins only). */
export function createLogMailer(): Mailer & { outbox(): Email[] } {
  const holder = globalThis as unknown as Record<symbol, Email[] | undefined>;
  const box = (holder[OUTBOX] ??= []);
  return {
    async send(email) {
      if (box.some((kept) => kept.idempotencyKey === email.idempotencyKey)) return;
      box.push({ ...email });
      if (box.length > OUTBOX_SIZE) box.splice(0, box.length - OUTBOX_SIZE);
    },
    outbox: () => box.map((email) => ({ ...email })),
  };
}

/** The part of Resend's client this uses; `new Resend(key)` satisfies it. */
type ResendLike = {
  emails: {
    send(
      payload: { from: string; to: string; subject: string; html: string; text: string },
      options: { idempotencyKey: string },
    ): Promise<{ error: { message: string } | null }>;
  };
};

/** EMAIL_MODE=resend (design §10). The idempotency key stops a retried batch from emailing anyone twice. */
export function createResendMailer(options: { apiKey: string; from: string }, client: ResendLike = new Resend(options.apiKey)): Mailer {
  return {
    async send(email) {
      const { error } = await client.emails.send(
        { from: options.from, to: email.to, subject: email.subject, html: email.html, text: email.text },
        { idempotencyKey: email.idempotencyKey },
      );
      if (error) throw new Error(`Resend refused the email: ${error.message}`);
    },
  };
}

export function mailerFor(env: { emailMode: "log" | "resend"; resend: { apiKey: string; from: string } | null }): Mailer {
  return env.emailMode === "resend" && env.resend ? createResendMailer(env.resend) : createLogMailer();
}
```

Create `src/lib/notifications/flush.ts`:

```ts
import { createHash } from "node:crypto";
import type { AppStore } from "@/lib/db/store";
import type { DirectoryUser } from "@/lib/users/types";
import { dueBatches } from "./batches";
import type { Mailer } from "./mailer";
import { recipientsFor } from "./recipients";
import { renderBatch } from "./render";

/** Design §4: handled event ids (and sent notifications) are kept 30 days. */
export const KEEP_DAYS = 30;

type FlushOptions = { store: AppStore; mailer: Mailer; users: () => Promise<DirectoryUser[]>; origin: string | null; now: Date; quietMs: number };

/**
 * Sends what's due (design §10): one email per person per batch. A batch is marked sent only once every one of its
 * emails went out. Otherwise it stays pending for the next run, and each email's idempotency key (the batch plus the
 * address) keeps anyone who already got it from getting it again.
 */
export async function flushNotifications({ store, mailer, users, origin, now, quietMs }: FlushOptions): Promise<{ batches: number; emails: number; failed: number }> {
  await store.forgetBefore(new Date(now.getTime() - KEEP_DAYS * 86_400_000));
  const batches = dueBatches(await store.pendingNotifications(), now, quietMs);
  if (batches.length === 0) return { batches: 0, emails: 0, failed: 0 };

  const [people, emailOff] = await Promise.all([users(), store.emailOffUsers()]);
  let emails = 0;
  let failed = 0;
  for (const batch of batches) {
    const eventIds = batch.items.map((item) => item.eventId);
    const recipients = recipientsFor(batch.audience, people, emailOff);
    const email = renderBatch(batch, origin);
    const batchKey = createHash("sha256").update([...eventIds].sort().join(",")).digest("hex");
    const results = await Promise.allSettled(recipients.map((recipient) => mailer.send({ ...email, to: recipient.email, idempotencyKey: `${batchKey}:${recipient.email}` })));
    const sent = results.filter((result) => result.status === "fulfilled").length;
    emails += sent;
    failed += results.length - sent;
    if (sent === results.length) await store.markSent(eventIds, recipients.map((recipient) => recipient.email), now);
  }
  return { batches: batches.length, emails, failed };
}
```

- [ ] **Step 7: Write the routes, the cron schedule and the settings**

Create `src/app/api/cron/notifications/route.ts`:

```ts
import { timingSafeEqual } from "node:crypto";
import { getStore } from "@/lib/db";
import { flushNotifications } from "@/lib/notifications/flush";
import { mailerFor } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";
import { getDirectory } from "@/lib/users/directory";
import { DirectoryError } from "@/lib/users/types";

const NO_STORE = { "Cache-Control": "no-store" };

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; compared in constant time. No secret set: nobody gets in. */
function authorized(header: string | null, secret: string | null): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const given = Buffer.from(header, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** GET /api/cron/notifications: every 5 minutes (vercel.json), sends the notification emails that are due (design §10). */
export async function GET(request: Request) {
  const env = servicesEnv();
  if (!authorized(request.headers.get("Authorization"), env.cronSecret)) {
    return Response.json({ ok: false, error: { status: 401, code: "unauthorized", message: "Missing or wrong CRON_SECRET." } }, { status: 401, headers: NO_STORE });
  }
  const store = getStore();
  const config = await store.webhook();
  try {
    const result = await flushNotifications({
      store,
      mailer: mailerFor(env),
      users: async () => (await (await getDirectory()).list()).users,
      origin: config ? new URL(config.url).origin : null,
      now: new Date(),
      quietMs: env.notifyQuietMs,
    });
    return Response.json({ ok: true, data: result }, { headers: NO_STORE });
  } catch (error) {
    if (!(error instanceof DirectoryError)) throw error;
    return Response.json({ ok: false, error: { status: 503, code: error.code, message: error.message } }, { status: 503, headers: NO_STORE });
  }
}
```

Create `src/app/api/dev/outbox/route.ts`:

```ts
import { serverEnv } from "@/lib/env";
import { createLogMailer } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";

/** Test logins with EMAIL_MODE=log only: the emails this server would have sent (e2e tests, local checks). 404 anywhere else. */
export async function GET() {
  if (serverEnv().authMode !== "mock" || servicesEnv().emailMode !== "log") return new Response(null, { status: 404 });
  return Response.json({ ok: true, data: createLogMailer().outbox() }, { headers: { "Cache-Control": "no-store" } });
}
```

Create `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/notifications", "schedule": "*/5 * * * *" }]
}
```

Append to `.env.example`:

```bash

# Notification emails (design §10): "log" sends nothing (local); "resend" sends through Resend.
EMAIL_MODE=log
RESEND_API_KEY=
# For example: Articles AI <notifications@fakhernco.com> (the domain needs Resend's DNS records in Cloudflare)
EMAIL_FROM=
# Vercel Cron sends it as "Authorization: Bearer …" to /api/cron/notifications (vercel.json, every 5 minutes).
CRON_SECRET=
# An audience's emails wait until nothing new has arrived for this many seconds, so a batch goes out as one email (default 120).
NOTIFY_QUIET_SECONDS=
```

- [ ] **Step 8: Add the messages**

Merge into `messages/en.json` at the top level:

```json
{
  "Email": {
    "subject": {
      "reviewers": "{count, plural, one {{n} draft ready for review} other {{n} drafts ready for review}}",
      "admins": "{count, plural, one {{n} update needs your attention} other {{n} updates need your attention}}"
    },
    "heading": {
      "reviewers": "New drafts are waiting in Review.",
      "admins": "Here's what changed on the website."
    },
    "drafted": "{count, plural, one {{n} draft is ready for review} other {{n} drafts are ready for review}}",
    "failed": "{count, plural, one {{n} post failed to publish} other {{n} posts failed to publish}}",
    "connection": "{name} connection: {status}",
    "quotaWarning": "{metric}: {used} of {limit} used this month",
    "quotaExceeded": "{metric}: the monthly limit of {limit} is reached",
    "scan": "{count, plural, one {Site scan finished: {n} finding} other {Site scan finished: {n} findings}}",
    "footer": "You get these emails because you can sign in to Articles AI. You can turn them off on the Email notifications page."
  }
}
```

Merge into `messages/ar.json` at the top level:

```json
{
  "Email": {
    "subject": {
      "reviewers": "{count, plural, one {مسودة واحدة جاهزة للمراجعة} two {مسودتان جاهزتان للمراجعة} few {{n} مسودات جاهزة للمراجعة} many {{n} مسودة جاهزة للمراجعة} other {{n} مسودة جاهزة للمراجعة}}",
      "admins": "{count, plural, one {تحديث واحد يحتاج إلى انتباهك} two {تحديثان يحتاجان إلى انتباهك} few {{n} تحديثات تحتاج إلى انتباهك} many {{n} تحديثًا يحتاج إلى انتباهك} other {{n} تحديث يحتاج إلى انتباهك}}"
    },
    "heading": {
      "reviewers": "مسودات جديدة بانتظارك في المراجعة.",
      "admins": "إليك ما تغيّر في الموقع."
    },
    "drafted": "{count, plural, one {مسودة واحدة جاهزة للمراجعة} two {مسودتان جاهزتان للمراجعة} few {{n} مسودات جاهزة للمراجعة} many {{n} مسودة جاهزة للمراجعة} other {{n} مسودة جاهزة للمراجعة}}",
    "failed": "{count, plural, one {تعذّر نشر منشور واحد} two {تعذّر نشر منشورين} few {تعذّر نشر {n} منشورات} many {تعذّر نشر {n} منشورًا} other {تعذّر نشر {n} منشور}}",
    "connection": "اتصال {name}: {status}",
    "quotaWarning": "{metric}: استُخدم {used} من {limit} هذا الشهر",
    "quotaExceeded": "{metric}: بلغ الحد الشهري {limit}",
    "scan": "{count, plural, one {انتهى فحص الموقع: ملاحظة واحدة} two {انتهى فحص الموقع: ملاحظتان} few {انتهى فحص الموقع: {n} ملاحظات} many {انتهى فحص الموقع: {n} ملاحظة} other {انتهى فحص الموقع: {n} ملاحظة}}",
    "footer": "تصلك هذه الرسائل لأنك تستطيع تسجيل الدخول إلى Articles AI. يمكنك إيقافها من صفحة إشعارات البريد."
  }
}
```

- [ ] **Step 9: Run the unit tests to make sure they pass**

Run: `pnpm test tests/unit/notifications.test.ts tests/unit/cron-route.test.ts tests/unit/messages.test.ts`
Expected: PASS (notifications 14, cron-route 3). If next-intl's `createTranslator` rejects `AbstractIntlMessages` for a namespace path in `typecheck`, cast the messages where they're passed, as `MESSAGES[locale] as never`, and ledger a ruling.

- [ ] **Step 10: Run the e2e test to make sure it passes**

Run: `pnpm e2e tests/e2e/notifications.spec.ts tests/e2e/settings-webhook.spec.ts`
Expected: PASS (2 + 5).

- [ ] **Step 11: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: exit 0; every unit test passes.

- [ ] **Step 12: Commit**

```bash
git add package.json pnpm-lock.yaml vercel.json .env.example src/lib/notifications src/app/api/cron src/app/api/dev/outbox messages playwright.config.ts tests/e2e/constants.ts tests/e2e/helpers.ts tests/unit/notifications.test.ts tests/unit/cron-route.test.ts tests/e2e/notifications.spec.ts
git commit -m "feat: email notifications: grouped per batch, bilingual, sent by the cron through Resend"
```

---

### Task 7: Each person's email setting

**Files:**
- Create:
  - `src/app/[locale]/(app)/notifications/page.tsx`, `src/app/[locale]/(app)/notifications/actions.ts`
  - `src/components/notifications/notifications-view.tsx`, `src/components/notifications/email-toggle.tsx`
- Modify: `src/components/shell/user-menu.tsx`, `messages/en.json`, `messages/ar.json`
- Test:
  - create: `tests/unit/notification-prefs.test.ts`
  - modify: `tests/e2e/notifications.spec.ts`

**Interfaces:**
- Consumes: Task 1 `getStore`, `servicesEnv`; Task 6 e2e helpers; M1 `requireSession`; M2a `useEngineAction`, `ActionError`
- Produces:
  - **`setEmailNotificationsAction({ locale, enabled, idempotencyKey })`:** `ActionResult<{ enabled: boolean }>`, for the signed-in person only, then `refresh()`
  - **`/notifications`** (every role), with test ids `email-status` (`data-enabled`), `email-toggle`, `notifications-log-mode`
  - **User menu:** link `user-notifications`

- [ ] **Step 1: Write the failing e2e test**

In `tests/e2e/notifications.spec.ts`:
- Change the helpers import to `import { deliverEvent, flushEmails, isolateMockStore, newEmails, pageInSharedStore, readOutbox, setUpWebhook, signInWithCookie } from "./helpers";`.
- Append:

```ts
test("someone who turns email off gets none; turning it back on restores it (Review Focus 5)", async ({ browser }) => {
  const store = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const admin = await pageInSharedStore(browser, store, "dev_admin");
  const reviewer = await pageInSharedStore(browser, store, "dev_reviewer");
  await setUpWebhook(admin);
  await flushEmails(admin);

  await reviewer.goto("/en");
  await reviewer.getByTestId("user-notifications").filter({ visible: true }).click();
  await expect(reviewer).toHaveURL(/\/en\/notifications$/);
  await expect(reviewer.getByTestId("email-status")).toHaveAttribute("data-enabled", "true");
  await reviewer.getByTestId("email-toggle").click();
  await expect(reviewer.getByTestId("email-status")).toHaveAttribute("data-enabled", "false");
  try {
    const before = await readOutbox(admin);
    await deliverEvent(admin, "post.drafted", { postId: "p_301", status: "pending" });
    expect(await flushEmails(admin)).toEqual({ batches: 1, emails: 0, failed: 0 });
    expect(newEmails(before, await readOutbox(admin))).toEqual([]);
  } finally {
    // The setting is kept per person in the server's store, shared by every test: put it back.
    await reviewer.getByTestId("email-toggle").click();
    await expect(reviewer.getByTestId("email-status")).toHaveAttribute("data-enabled", "true");
  }
});

test("the Email notifications page in Arabic, for an Admin", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/ar/notifications");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1, name: "إشعارات البريد" })).toBeVisible();
  await expect(page.getByTestId("email-status")).toHaveText("الرسائل مفعّلة.");
  await expect(page.getByTestId("notifications-log-mode")).toBeVisible();
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm e2e tests/e2e/notifications.spec.ts`
Expected: the two new tests FAIL. There's no `user-notifications` link, and `/ar/notifications` is a 404. Task 6's two tests still pass.

- [ ] **Step 3: Write the failing unit test**

Create `tests/unit/notification-prefs.test.ts`:

```ts
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
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `pnpm test tests/unit/notification-prefs.test.ts`
Expected: FAIL to resolve `@/app/[locale]/(app)/notifications/actions`.

- [ ] **Step 5: Write the action, the page and the menu link**

Create `src/app/[locale]/(app)/notifications/actions.ts`:

```ts
"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { IdempotencyKey, INVALID, Locale } from "@/lib/actions/server";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";

/**
 * Design §4 preferences: each person turns their own notification emails on or off. Setting the same value twice changes
 * nothing, so the idempotency key from useEngineAction is checked and not used.
 */
export async function setEmailNotificationsAction(input: { locale: string; enabled: boolean; idempotencyKey: string }): Promise<ActionResult<{ enabled: boolean }>> {
  const parsed = z.object({ locale: Locale, enabled: z.boolean(), idempotencyKey: IdempotencyKey }).safeParse(input);
  if (!parsed.success) return INVALID;
  const { locale, enabled } = parsed.data;
  const session = await requireSession(locale);
  await getStore().setEmailOff(session.userId, !enabled, new Date());
  refresh();
  return { ok: true, data: { enabled } };
}
```

Create `src/components/notifications/email-toggle.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { setEmailNotificationsAction } from "@/app/[locale]/(app)/notifications/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";

export function EmailToggle({ locale, enabled }: { locale: string; enabled: boolean }) {
  const t = useTranslations("Notifications");
  const toggle = useEngineAction(setEmailNotificationsAction);
  const [error, setError] = useState<EngineFailure | null>(null);

  async function flip() {
    setError(null);
    const result = await toggle.run({ locale, enabled: !enabled });
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex flex-col gap-2">
      <p data-testid="email-status" data-enabled={String(enabled)} className={enabled ? "text-ok-fg" : "text-muted-foreground"}>
        {enabled ? t("on") : t("off")}
      </p>
      <div>
        <Button variant="outline" data-testid="email-toggle" disabled={toggle.pending} onClick={() => void flip()}>
          {enabled ? t("turnOff") : t("turnOn")}
        </Button>
      </div>
      {error && <ActionError error={error} />}
    </div>
  );
}
```

Create `src/components/notifications/notifications-view.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { servicesEnv } from "@/lib/services-env";
import { EmailToggle } from "./email-toggle";

/** What this person gets by email (design §10), and their switch for it (design §4 preferences). */
export async function NotificationsView({ locale }: { locale: AppLocale }) {
  const session = await requireSession(locale);
  const t = await getTranslations("Notifications");
  const enabled = !(await getStore().emailOffUsers()).has(session.userId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
        <CardDescription>{t(`what.${session.role}`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <EmailToggle locale={locale} enabled={enabled} />
        {servicesEnv().emailMode === "log" && (
          <p data-testid="notifications-log-mode" className="text-muted-foreground">
            {t("logMode")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

Create `src/app/[locale]/(app)/notifications/page.tsx`:

```tsx
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionSkeleton } from "@/components/dashboard/section-skeleton";
import { NotificationsView } from "@/components/notifications/notifications-view";
import { asAppLocale } from "@/i18n/locales";

export default async function NotificationsPage({ params }: PageProps<"/[locale]/notifications">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Notifications");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl">{t("title")}</h1>
      <Suspense fallback={<SectionSkeleton />}>
        <NotificationsView locale={locale} />
      </Suspense>
    </div>
  );
}
```

In `src/components/shell/user-menu.tsx`, insert before the comment line `{/* Design §5: two-factor login is recommended for Reviewers; the link is the reminder until it's on. */}`:

```tsx
      <Link href="/notifications" data-testid="user-notifications" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        {t("notifications")}
      </Link>
```

- [ ] **Step 6: Add the messages**

Merge into `messages/en.json`:
- at `Shell`: `{ "notifications": "Email notifications" }`
- at the top level:

```json
{
  "Notifications": {
    "title": "Email notifications",
    "cardTitle": "Your emails",
    "what": {
      "admin": "As an Admin you get an email when posts fail to publish, a connection breaks or is about to expire, a quota runs low, or a site scan finishes, and about new drafts when there are no Reviewers. Several updates arrive as one email.",
      "reviewer": "As a Reviewer you get an email when new drafts are ready for review. Several drafts arrive as one email."
    },
    "on": "Emails are on.",
    "off": "Emails are off. You'll still see everything in the dashboard.",
    "turnOff": "Turn emails off",
    "turnOn": "Turn emails on",
    "logMode": "This server doesn't send emails yet (EMAIL_MODE=log)."
  }
}
```

Merge into `messages/ar.json`:
- at `Shell`: `{ "notifications": "إشعارات البريد" }`
- at the top level:

```json
{
  "Notifications": {
    "title": "إشعارات البريد",
    "cardTitle": "رسائلك",
    "what": {
      "admin": "بصفتك مسؤولًا تصلك رسالة عند تعذّر نشر منشورات، أو تعطّل اتصال أو قرب انتهاء صلاحيته، أو اقتراب نفاد حصة، أو انتهاء فحص الموقع، وكذلك عن المسودات الجديدة عند عدم وجود مراجعين. تصل التحديثات المتعددة في رسالة واحدة.",
      "reviewer": "بصفتك مراجعًا تصلك رسالة عند جاهزية مسودات جديدة للمراجعة. تصل المسودات المتعددة في رسالة واحدة."
    },
    "on": "الرسائل مفعّلة.",
    "off": "الرسائل متوقفة. ستظل ترى كل شيء في لوحة التحكم.",
    "turnOff": "إيقاف الرسائل",
    "turnOn": "تفعيل الرسائل",
    "logMode": "لا يرسل هذا الخادم رسائل بريد بعد (EMAIL_MODE=log)."
  }
}
```

- [ ] **Step 7: Run the tests to make sure they pass**

Run: `pnpm test tests/unit/notification-prefs.test.ts tests/unit/messages.test.ts && pnpm e2e tests/e2e/notifications.spec.ts tests/e2e/auth.spec.ts tests/e2e/security.spec.ts`
Expected: PASS. Notifications has 4 tests. Auth and security still pass with the new menu link.

- [ ] **Step 8: Lint, typecheck and the whole unit suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: exit 0; every unit test passes.

- [ ] **Step 9: Commit**

```bash
git add "src/app/[locale]/(app)/notifications" src/components/notifications src/components/shell/user-menu.tsx messages tests/unit/notification-prefs.test.ts tests/e2e/notifications.spec.ts
git commit -m "feat: each person can turn their notification emails off and on"
```

---

### Task 8: M4c wrap-up and full verification

**Files:**
- Create: `docs/plans/2026-10-22-m4c-followups.md`
- Modify: `README.md`, `docs/plans/2026-10-22-m3a-followups.md`

**Interfaces:**
- Consumes: everything above
- Produces: a documented, fully green M4c

- [ ] **Step 1: Update `README.md`**

In `## Run locally`, after the `signin_down` bullet, add:

```markdown
- `DB_MODE=memory` and `EMAIL_MODE=log` (the defaults): the dashboard's small database lives in the server's memory, and emails are only kept for the test outbox (`/api/dev/outbox`). Both are for local use; see "Database, webhook and email" for Vercel.
- With test logins, `POST /api/dev/mock-webhook` with `{ "event": "post.drafted", "data": { "postId": "p_201", "status": "pending" } }` makes the mock engine deliver a signed webhook (set the webhook up first, in Settings → Webhook). `GET /api/cron/notifications` with `Authorization: Bearer $CRON_SECRET` sends what's due.
```

Insert before `## Decisions in M1`:

```markdown
## Database, webhook and email (Vercel)

1. **Database:** add Neon from the Vercel Marketplace (it sets `DATABASE_URL`), and set `DB_MODE=neon`.
   - Set `WEBHOOK_ENCRYPTION_KEY` to `openssl rand -base64 32`. Keep it: changing it means getting a new webhook secret.
   - Apply the migrations once, and after every schema change: `DATABASE_URL=… pnpm db:migrate`.
   - Pull `DATABASE_URL` from the Neon dashboard, not with `vercel env pull`, which can also write `VERCEL="1"` locally.
2. **Email:** in Resend, add the sending domain (for example `notifications.fakhernco.com`). Add the DNS records Resend lists (DKIM, and its SPF/MX for the sending subdomain) in **Cloudflare**; the Microsoft 365 mail setup is unaffected. Then set:
   - `EMAIL_MODE=resend`
   - `RESEND_API_KEY`
   - `EMAIL_FROM` (for example `Articles AI <notifications@notifications.fakhernco.com>`)
3. **Cron:** set `CRON_SECRET` (a long random string). `vercel.json` calls `/api/cron/notifications` every 5 minutes, which needs Vercel Pro; on Hobby, crons run at most once a day.
4. **Webhook:** after deploying, open **Settings → Webhook** on the production address and press **Set up webhook**. It registers `https://<address>/api/hooks/marketing` with Quantum1st, and keeps the signing secret encrypted. A preview deployment that does the same takes the webhook over (one webhook per site): set it up again on production afterwards.
```

Append at the end of the file:

```markdown

## Decisions in M4c (database, webhooks, email)

- **The dashboard's database** holds only:
  - webhook event ids (30 days)
  - the webhook registration, with its secret encrypted (AES-256-GCM)
  - the notification log
  - each person's email setting

  Locally it lives in memory (`DB_MODE=memory`, refused on Vercel); on Vercel it's Neon through Drizzle.
- **The webhook receiver** (`/api/hooks/marketing`):
  - It checks `X-Signature` against the raw body in constant time, before parsing anything.
  - A delivery it can't verify gets 401 and changes nothing.
  - A repeated `X-Event-Id` is acknowledged and ignored.
  - An event it doesn't know is acknowledged, so the engine stops retrying.
  - Screens aren't cached, so deliveries don't refresh anything; jobs are still followed by polling.
- **Webhook setup** (Settings → Webhook):
  - Every setup asks the engine for a new secret, so the stored one always matches.
  - The page says when the webhook points at another address, or when this server can't read its secret (a changed `WEBHOOK_ENCRYPTION_KEY`).
- **Emails** (design §10):
  - **Who gets what:** drafts go to Reviewers (to the Admins when there are no Reviewers). Failed posts, connections that stop working or are about to expire, quota warnings and finished site scans go to the Admins.
  - **Batching:** a batch goes out as one email per person, English then Arabic, once nothing new has arrived for 2 minutes. The cron runs every 5 minutes.
  - **Retries:** a failed send is retried on the next run. Resend's idempotency key keeps anyone from getting it twice.
  - **Each person's setting:** everyone can turn their emails off on the Email notifications page.
- **Not built:**
  - **Badges from webhooks:** every list and the dashboard read the engine when they open, so their counts are current.
  - **React Email:** the templates are plain HTML and text from the message files.
```

- [ ] **Step 2: Update the follow-up docs**

In `docs/plans/2026-10-22-m3a-followups.md`, append ` — M4c: not built; every list and the dashboard read the engine when they open, so counts are current without webhook badges` to "Keyword and suggestion badges from webhooks: M4."

Create `docs/plans/2026-10-22-m4c-followups.md`:

```markdown
# M4c follow-ups

Carry these into the M5 plan.

## Before go-live (M5)

- **Neon has never run:** the Neon store is checked only through the SQL it builds. With a real database:
  - `pnpm db:migrate` creates the four tables.
  - A webhook delivery is recorded, and the same delivery sent twice is recorded once.
  - The Webhook page shows the last delivery.
- **Resend has never sent:** with the domain verified (README, Database, webhook and email):
  - A drafts email reaches a Microsoft 365 inbox, not junk mail.
  - Both languages show correctly in Outlook (the Arabic part right to left).
  - The links open the production address.
- **The cron runs:** the Vercel dashboard lists the cron, its calls answer 200, and a call without `CRON_SECRET` answers 401.
- **A real delivery from Quantum1st verifies:** the Webhook page shows "Set up", and a delivery shows as the last one received.

## Known limits

- The in-memory store (`DB_MODE=memory`) is one per server process and is lost on restart; it's for local work and the e2e suite only.
- A batch whose email keeps failing (for example an unverified sending domain) is retried every 5 minutes until it goes out.
- Emails can't say whose action caused them: the events carry no acting user.

## Questions for Quantum1st (from M4c)

- **Deliveries:** how often, and for how long, is a failed delivery retried? What timeout does the engine allow for the dashboard's answer?
- **Redrafts:** does a finished redraft send `post.drafted` again (the dashboard then emails Reviewers), or only `job.finished`?
- **`connection.changed` status values:** are they `ok`, `expiring`, `error` and `missing`, as `/sites` uses? The dashboard emails for anything but `ok`.
- **Event filter:** does `PUT …/webhook` `events` filter the deliveries, and does a new event type need the list updated?
```

- [ ] **Step 3: Run every check from a clean build**

```bash
rm -rf .next
pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && ALLOW_TEST_LOGINS=1 pnpm build
```

Expected:
- lint and typecheck exit 0
- Vitest: about 440 passed (385 + 55)
- Playwright: about 164 passed (155 + 9)
- the build lists `◐ /en/settings/webhook`, `◐ /en/notifications` and `ƒ` routes for `/api/hooks/marketing`, `/api/cron/notifications`, `/api/dev/mock-webhook` and `/api/dev/outbox`

- [ ] **Step 4: Manual smoke test**

Run `pnpm dev` with `CRON_SECRET=smoke NOTIFY_QUIET_SECONDS=0`:
- Keep the smoke script and the dev log in the scratchpad, outside the repo, and run the script with `NODE_PATH=<repo>/node_modules`.
- Warm the dev server first.
- Interact only after `networkidle`.
- Use a fresh `mock_store` cookie.

Check:
- (a) **Setup:** as Admin, Settings → Webhook shows "Not set up" with this address. Set up makes it "Set up", and a mock delivery then shows as the last one.
- (b) **Signatures:** a delivery with a wrong signature answers 401; a repeated event id answers `duplicate`.
- (c) **Emails:**
  - Three `post.drafted` and one `connection.changed` (`linkedin`, `expiring`) are delivered, then the cron runs.
  - The outbox gains one email to the Reviewer ("3 drafts ready for review · 3 مسودات جاهزة للمراجعة").
  - It also gains one to each Admin, with "LinkedIn connection: expiring soon".
  - A second cron run sends nothing.
- (d) **Turning email off:** as Reviewer, Email notifications → Turn emails off. The next drafts email doesn't reach the Reviewer. Turning it on again restores it.
- (e) **Arabic:** `/ar/settings/webhook` and `/ar/notifications` are right to left.
- (f) **Dev console:** no console errors, no dev overlay, and no errors in the `pnpm dev` log.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: M4c decisions, Neon/Resend/cron setup and go-live checks; webhooks and email notifications complete"
git log --oneline | head -12
```

---

## Decisions in M4c

These come from the plan, ahead of execution:

- **In memory by default, Neon only when configured:**
  - The dashboard runs with no keys, like `ENGINE_MODE=mock` and `AUTH_MODE=mock`.
  - Memory is refused on Vercel, where each instance has its own memory.
- **The Neon store is tested through its SQL,** because no database runs locally and PGlite would be a new package. It's on the go-live list, as the Clerk adapter was in M4b.
- **Every webhook setup asks for a new secret.**
  - The engine returns a secret only on the first save or on a rotation.
  - A deployment that lost its secret, or was replaced by a preview, gets back in sync with one click.
- **The receiver records the event id and its notification together** (Neon: one batched transaction). The notification is keyed by the event id, so a delivery retried after a crash can't email twice.
- **Emails are grouped per audience after a quiet period, sent by a cron:**
  - Serverless functions can't wait, so the receiver only queues.
  - The cron (every 5 minutes, 2-minute quiet period) sends.
  - The e2e suite runs the cron itself with a 0-second quiet period.
- **One bilingual email instead of one per language:** people have no language preference stored, and design §10 asks for one email per batch.
- **Drafts go to the Admins when there are no Reviewers:** a small team with only an Admin would otherwise never hear about drafts.
- **The email setting is on or off per person:** design §4 lists "preferences", and design §10 names no finer choice.
- **No badges from webhooks:** pages aren't cached, so the counts every screen shows are current when it opens (the M3a follow-up said "M4").
- **Test-only routes** (`/api/dev/mock-webhook`, `/api/dev/outbox`) answer 404 unless test logins are on. Test logins are refused on Vercel and in production builds without `ALLOW_TEST_LOGINS=1`.

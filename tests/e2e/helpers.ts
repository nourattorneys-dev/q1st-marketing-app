import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { BASE_URL, E2E_CRON_SECRET } from "./constants";

export type TestUser = "dev_admin" | "dev_reviewer" | "dev_norole" | "dev_admin_no2fa";

export async function signInWithCookie(context: BrowserContext, user: TestUser): Promise<void> {
  await context.addCookies([{ name: "dev_session", value: user, url: BASE_URL }]);
}

export async function setMockScenario(
  context: BrowserContext,
  scenario:
    | "normal"
    | "unauthorized"
    | "down"
    | "drift"
    | "manual"
    | "crash"
    | "quota"
    | "firstrun"
    | "performance"
    | "signin_down"
    | "auth_crash"
    | "twofactor_off",
): Promise<void> {
  await context.addCookies([{ name: "mock_scenario", value: scenario, url: BASE_URL }]);
}

/** ICU uses narrow no-break spaces in times; compare with plain spaces. */
export function normalizeSpaces(text: string): string {
  return text.replace(/\s+/gu, " ");
}

/** Gives this test its own copy of the mock engine's data, so tests can't affect each other. */
export async function isolateMockStore(context: BrowserContext): Promise<void> {
  const namespace = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await context.addCookies([{ name: "mock_store", value: namespace, url: BASE_URL }]);
}

/** A page for `user` on a mock engine shared with other pages (same store namespace), for two-person tests. */
export async function pageInSharedStore(browser: Browser, store: string, user: TestUser): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "mock_store", value: store, url: BASE_URL },
    { name: "dev_session", value: user, url: BASE_URL },
  ]);
  return context.newPage();
}

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

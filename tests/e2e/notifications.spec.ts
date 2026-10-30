import { expect, test } from "@playwright/test";
import { deliverEvent, flushEmails, isolateMockStore, newEmails, pageInSharedStore, readOutbox, setUpWebhook, signInWithCookie } from "./helpers";

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
  await expect(page.getByTestId("test-email-send")).toHaveText("أرسل لي رسالة تجريبية");
  await page.getByTestId("test-email-send").click();
  await expect(page.getByTestId("test-email-result")).toHaveText("لم تُرسل: لا يرسل هذا الخادم رسائل بريد بعد.");
});

test("an Admin sends themselves a test email; with EMAIL_MODE=log it's only kept (M5b)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  const before = await readOutbox(page);
  await page.goto("/en/notifications");
  await page.getByTestId("test-email-send").click();
  const result = page.getByTestId("test-email-result");
  await expect(result).toHaveAttribute("data-state", "log");
  await expect(result).toHaveText("Not sent: this server doesn't send emails yet.");
  await expect(page.getByTestId("test-email-send")).toHaveText("Send me a test email");

  const sent = newEmails(before, await readOutbox(page));
  expect(sent.map((email) => email.to)).toEqual(["admin@example.com"]);
  expect(sent[0].subject).toBe("Q1st Marketing test email · رسالة تجريبية من Q1st Marketing");
  expect(sent[0].text).toContain("This is a test from Q1st Marketing. If you can read this, the dashboard's emails work.");
  expect(sent[0].html).toContain('<div dir="rtl" lang="ar"');

  await page.getByTestId("test-email-send").click(); // each press is a new email
  await expect.poll(async () => newEmails(before, await readOutbox(page)).length).toBe(2);
});

test("a Reviewer has no test-email button (M5b)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/notifications");
  await expect(page.getByTestId("email-status")).toBeVisible();
  await expect(page.getByTestId("test-email-send")).toHaveCount(0);
});

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


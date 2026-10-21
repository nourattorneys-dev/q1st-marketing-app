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


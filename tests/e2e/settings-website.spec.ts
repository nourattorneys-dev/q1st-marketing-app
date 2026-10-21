import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_admin");
});

test("shows the saved WordPress connection drawn from /meta; the password is never shown (Review Focus 3)", async ({ page }) => {
  await page.goto("/en/settings/website");
  await expect(page.getByTestId("website-type")).toHaveValue("wordpress");
  await expect(page.getByTestId("website-field-url")).toHaveValue("https://fakhernco.com");
  await expect(page.getByTestId("website-field-username")).toHaveValue("articles-ai");
  await expect(page.getByTestId("website-field-collection")).toHaveCount(0);
  await expect(page.getByTestId("website-field-secret")).toHaveValue("");
  await expect(page.getByTestId("website-secret-kept")).toBeVisible();
  await expect(page.getByTestId("website-status")).toHaveAttribute("data-status", "ok");
  await expect(page.getByText("Publishing user")).toBeVisible();
  expect(await page.content()).not.toContain("seeded-application-password");
});

test("a wrong application password fails the test with its message, and Save stays blocked (spec v1.1 §10, Review Focus 1)", async ({ page }) => {
  await page.goto("/en/settings/website");
  await page.getByTestId("website-field-secret").fill("wrong-password");
  await expect(page.getByTestId("website-needs-test")).toBeVisible();
  await expect(page.getByTestId("settings-save")).toBeDisabled();
  await page.getByTestId("website-test").click();
  await expect(page.getByTestId("website-test-result")).toHaveAttribute("data-ok", "false");
  await expect(page.getByTestId("website-test-result")).toContainText("401 Unauthorized");
  await expect(page.getByTestId("settings-save")).toBeDisabled();
  await page.getByTestId("website-field-secret").fill("new-application-password");
  await page.getByTestId("website-test").click();
  await expect(page.getByTestId("website-test-result")).toHaveAttribute("data-ok", "true");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await expect(page.getByTestId("website-field-secret")).toHaveValue("");
});

test("changing the address after a passing test blocks Save until it's tested again", async ({ page }) => {
  await page.goto("/en/settings/website");
  await page.getByTestId("website-test").click();
  await expect(page.getByTestId("website-test-result")).toHaveAttribute("data-ok", "true");
  await expect(page.getByTestId("field-map-keywords")).toHaveValue("tags");
  await expect(page.getByTestId("settings-save")).toBeEnabled();
  await page.getByTestId("website-field-url").fill("https://www.fakhernco.com");
  await expect(page.getByTestId("settings-save")).toBeDisabled();
  await expect(page.getByTestId("website-needs-test")).toBeVisible();
});

test("a change to the field map saves without a new test", async ({ page }) => {
  await page.goto("/en/settings/website");
  await page.getByTestId("field-map-subtitle").selectOption("");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("field-map-title")).toHaveValue("title");
  await expect(page.getByTestId("field-map-subtitle")).toHaveCount(0);
});

test("switching to Strapi shows its own fields, fills both maps from the test, and new articles publish there (Review Focus 2)", async ({ page }) => {
  await page.goto("/en/settings/website");
  await page.getByTestId("website-type").selectOption("strapi");
  await expect(page.getByTestId("website-field-username")).toHaveCount(0);
  await expect(page.getByTestId("website-secret-kept")).toHaveCount(0);
  await expect(page.getByTestId("website-body-format")).toHaveValue("blocks");
  await expect(page.getByTestId("website-arabic-mode")).toHaveValue("locale");
  await page.getByTestId("website-field-url").fill("https://cms.fakhernco.com");
  await page.getByTestId("website-field-collection").fill("posts");
  await page.getByTestId("website-field-secret").fill("strapi-api-token");
  await page.getByTestId("website-test").click();
  await expect(page.getByTestId("website-test-result")).toHaveAttribute("data-ok", "true");
  await expect(page.getByTestId("block-map-heading")).toHaveValue("blocks.heading");
  await expect(page.getByTestId("field-map-metaTitle")).toHaveValue("seo.metaTitle");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await page.goto("/en/scheduled");
  await page.getByTestId("publish-p_101").click();
  await page.getByTestId("publish-p_101-confirm").click();
  await expect(page.getByTestId("scheduled-row-p_101")).toHaveCount(0);
  await page.goto("/en/history");
  await expect(page.getByTestId("history-target-p_101")).toHaveText("Strapi");
  await expect(page.getByTestId("history-target-p_301")).toHaveText("WordPress");
});

test("in Arabic, fields the portal knows get Arabic labels", async ({ page }) => {
  await page.goto("/ar/settings/website");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("مستخدم النشر")).toBeVisible();
});

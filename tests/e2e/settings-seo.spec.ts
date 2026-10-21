import { expect, test } from "@playwright/test";
import { isolateMockStore, pageInSharedStore, signInWithCookie } from "./helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_admin");
});

test("edits and saves the profile; lists take commas, Arabic commas or new lines", async ({ page }) => {
  await page.goto("/en/settings/seo");
  await expect(page.getByTestId("seo-siteName")).toHaveValue("Fakher & Co");
  await page.getByTestId("seo-focusKeywords").fill("legal consultancy dubai، uae labour law\ncontract review uae");
  await page.getByTestId("seo-cta").fill("Talk to our consultants");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("seo-focusKeywords")).toHaveValue("legal consultancy dubai, uae labour law, contract review uae");
  await expect(page.getByTestId("seo-cta")).toHaveValue("Talk to our consultants");
});

test("an address the engine refuses shows its message next to the field", async ({ page }) => {
  await page.goto("/en/settings/seo");
  await page.getByTestId("seo-siteUrl").fill("fakhernco");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("field-error-siteUrl")).toHaveText("Enter a full address, like https://example.com.");
});

test("AI suggestions fill focus keywords and the call to action, unsaved until Save", async ({ page }) => {
  await page.goto("/en/settings/seo");
  await page.getByTestId("seo-propose").click();
  await expect(page.getByTestId("seo-proposed")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("seo-focusKeywords")).toHaveValue(/uae labour law advice/);
  await expect(page.getByTestId("seo-cta")).toHaveValue("Book a consultation with Fakher & Co");
  await expect(page.getByTestId("settings-unsaved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("seo-cta")).toHaveValue("Book a consultation");
});

test("uploads and removes the share picture; a file of the wrong type shows the engine's message", async ({ page }) => {
  await page.goto("/en/settings/seo");
  await expect(page.getByTestId("seo-picture-none")).toBeVisible();
  await page.getByTestId("seo-picture-upload").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByTestId("seo-picture-error")).toContainText("Only JPEG, PNG or WebP pictures can be uploaded.");
  await page.getByTestId("seo-picture-upload").setInputFiles({ name: "share.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("seo-picture-preview")).toBeVisible();
  await page.getByTestId("seo-picture-remove").click();
  await expect(page.getByTestId("seo-picture-preview")).toHaveCount(0);
});

test("someone saved first: both values show, and Keep my changes keeps both people's edits (Review Focus 4)", async ({ browser }) => {
  const store = `seo${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const first = await pageInSharedStore(browser, store, "dev_admin");
  const second = await pageInSharedStore(browser, store, "dev_admin");
  await first.goto("/en/settings/seo");
  await second.goto("/en/settings/seo");
  await first.getByTestId("seo-cta").fill("Call Fakher & Co");
  await first.getByTestId("settings-save").click();
  await expect(first.getByTestId("settings-saved")).toBeVisible();
  await second.getByTestId("seo-tone").fill("warm and plain");
  await second.getByTestId("settings-save").click();
  await expect(second.getByTestId("settings-conflict")).toBeVisible();
  await expect(second.getByTestId("settings-conflict-cta")).toContainText("Call Fakher & Co");
  await expect(second.getByTestId("settings-conflict-tone")).toContainText("warm and plain");
  await second.getByTestId("settings-conflict-keep-mine").click();
  await expect(second.getByTestId("settings-saved")).toBeVisible();
  await first.reload();
  await expect(first.getByTestId("seo-cta")).toHaveValue("Call Fakher & Co");
  await expect(first.getByTestId("seo-tone")).toHaveValue("warm and plain");
});

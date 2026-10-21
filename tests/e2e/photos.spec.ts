import { expect, test, type Page } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

// A 1×1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

async function pickFirstPhoto(page: Page) {
  await page.getByTestId("photo-find").click();
  await page.getByTestId("photo-search-input").fill("court building");
  await page.getByTestId("photo-search").click();
  await page.locator('[data-testid^="photo-use-"]').first().click();
  await expect(page.getByTestId("photo-preview")).toBeVisible();
}

test("picking a Pexels photo saves its credit (spec v1.1 §10)", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await pickFirstPhoto(page);
  await expect(page.getByTestId("photo-credit")).toHaveValue("Photo by Mock Photographer 1 on Pexels");
  await page.reload();
  await expect(page.getByTestId("photo-credit")).toHaveValue("Photo by Mock Photographer 1 on Pexels");
});

test("after picking a photo, saving other fields doesn't report a conflict (Review Focus 2)", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await pickFirstPhoto(page);
  await page.getByTestId("field-title").fill("Commission rules in the UAE");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await expect(page.getByTestId("conflict-panel")).toHaveCount(0);
});

test("an upload of the wrong type shows the server's message (spec v1.1 §10)", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("photo-upload").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByTestId("photo-panel").getByTestId("action-error")).toHaveText("Only JPEG, PNG or WebP photos can be uploaded.");
});

test("a photo over the size limit is stopped before it's uploaded", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("photo-upload").setInputFiles({ name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(6_000_000) });
  await expect(page.getByTestId("photo-too-large")).toContainText("the limit is 5 MB");
});

test("upload a photo, save its alt text, then remove it", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("photo-upload").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("photo-preview")).toBeVisible();
  await page.getByTestId("photo-alt").fill("A signed employment contract on a desk");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("photo-alt")).toHaveValue("A signed employment contract on a desk");
  await page.getByTestId("photo-remove").click();
  await expect(page.getByTestId("photo-none")).toBeVisible();
});

test("an Instagram post asks for a photo and can't be approved without one", async ({ page }) => {
  await page.goto("/en/review/p_209");
  await expect(page.getByTestId("photo-required")).toBeVisible();
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("action-error")).toHaveText("An Instagram post needs a photo.");
});

import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

const chips = "[data-testid^='hashtag-chip-']";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("hashtags are tidy chips: typed words get a #, a duplicate is dropped, and the change saves", async ({ page }) => {
  await page.goto("/en/review/p_206");
  await page.getByTestId("hashtag-input").fill("dubai labour, #dubai");
  await page.getByTestId("hashtag-input").press("Enter");
  await expect(page.getByTestId("hashtags").locator(chips)).toHaveCount(3);
  await expect(page.getByTestId("hashtag-chip-2")).toHaveText(/#labour/);
  await page.getByTestId("hashtag-remove-0").click();
  await expect(page.getByTestId("hashtag-chip-0")).toHaveText(/#Dubai/);
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("hashtags").locator(chips)).toHaveCount(2);
});

test("the preview shows the caption with its hashtags, and counts the characters", async ({ page }) => {
  await page.goto("/en/review/p_206");
  const caption = page.getByTestId("social-preview-caption");
  await expect(caption).toContainText("Resigning doesn't cancel a commission");
  await expect(caption).toContainText("#UAELabourLaw #Dubai");
  await expect(page.getByTestId("social-preview-count")).toHaveText("127 characters");
  await page.getByTestId("editor-body").fill("Short update.");
  await expect(page.getByTestId("social-preview-count")).toHaveText("35 characters");
});

test("an article has neither hashtags nor a social preview", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await expect(page.getByTestId("field-title")).toBeVisible();
  await expect(page.getByTestId("social-preview")).toHaveCount(0);
  await expect(page.getByTestId("hashtag-input")).toHaveCount(0);
});

import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("lists posts waiting for review with pairs, findings and drafting state", async ({ page }) => {
  await page.goto("/en/review");
  await expect(page.getByTestId("review-count")).toHaveText("9 of 9 posts");
  await expect(page.getByTestId("card-twin-p_201")).toHaveText("Pair: Arabic");
  await expect(page.getByTestId("card-critical-p_203")).toHaveText("1 critical");
  await expect(page.getByTestId("card-drafting-p_207")).toBeVisible();
  await expect(page.getByTestId("card-select-p_207")).toBeDisabled();
});

test("shows Arabic titles right to left", async ({ page }) => {
  await page.goto("/en/review");
  await expect(page.getByTestId("card-title-p_202")).toHaveAttribute("dir", "rtl");
});

test("bulk approve approves what it can and names what it couldn't", async ({ page }) => {
  await page.goto("/en/review");
  await page.getByTestId("card-select-p_201").check();
  await page.getByTestId("card-select-p_205").check();
  await page.getByTestId("approve-selected").click();
  await expect(page.getByTestId("bulk-failures")).toBeVisible();
  await expect(page.getByTestId("card-p_201")).toHaveCount(0);
  await expect(page.getByTestId("card-p_205")).toBeVisible();
});

test("the nav links to the review queue", async ({ page }) => {
  await page.goto("/en");
  await page.getByTestId("nav-review").click();
  await expect(page).toHaveURL(/\/en\/review$/);
});

test("bulk publish publishes the selected posts, a post with critical findings too (a reason is optional)", async ({ page }) => {
  await page.goto("/en/review");
  await page.getByTestId("card-select-p_201").check();
  await page.getByTestId("card-select-p_203").check();
  await page.getByTestId("publish-selected").click();
  await page.getByTestId("publish-selected-confirm").click();
  await expect(page.getByTestId("card-p_203")).toHaveCount(0);
  await expect(page.getByTestId("card-p_201")).toHaveCount(0);
});

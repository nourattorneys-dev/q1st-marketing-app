import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("shows an English article and its Arabic version side by side", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("compare-toggle").click();
  await expect(page.getByTestId("twin-view")).toBeVisible();
  await expect(page.getByTestId("twin-summary")).toHaveText("The structure matches (7 sections).");
  await expect(page.getByTestId("twin-left")).toHaveAttribute("dir", "ltr");
  await expect(page.getByTestId("twin-right")).toHaveAttribute("dir", "rtl");
});

test("points at the section that doesn't line up", async ({ page }) => {
  await page.goto("/en/review/p_205");
  await page.getByTestId("compare-toggle").click();
  await expect(page.getByTestId("twin-summary")).toContainText("1 section doesn't line up");
  await expect(page.getByTestId("twin-row-mismatch")).toHaveCount(1);
});

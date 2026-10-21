import { expect, test } from "@playwright/test";
import { isolateMockStore, normalizeSpaces, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("lists the queue in order with 12-hour Dubai times; a held post shows On hold (Review Focus 3)", async ({ page }) => {
  await page.goto("/en/scheduled");
  await expect(page.getByTestId("schedule-banner")).toContainText("10:00");
  const rows = page.locator('[data-testid^="scheduled-row-"]');
  await expect(rows).toHaveCount(3);
  expect(await rows.evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")))).toEqual([
    "scheduled-row-p_101",
    "scheduled-row-p_102",
    "scheduled-row-p_103",
  ]);
  const time = normalizeSpaces(await page.getByTestId("scheduled-time-p_101").innerText());
  expect(time).toContain("10:00");
  expect(time).toContain("AM");
  await expect(page.getByTestId("scheduled-hold-p_103")).toHaveText("On hold");
  await expect(page.getByTestId("scheduled-time-p_103")).toHaveText("Not scheduled");
});

test("holding the first post moves the next one up; resuming puts it back", async ({ page }) => {
  await page.goto("/en/scheduled");
  await page.getByTestId("hold-p_101").click();
  await expect(page.getByTestId("scheduled-hold-p_101")).toBeVisible();
  await expect(page.getByTestId("scheduled-time-p_102")).toContainText("10:00");
  await page.getByTestId("resume-p_101").click();
  await expect(page.getByTestId("scheduled-time-p_101")).toContainText("10:00");
});

test("publish now sends one post out and leaves its Arabic twin in the queue", async ({ page }) => {
  await page.goto("/en/scheduled");
  await page.getByTestId("publish-p_101").click();
  await page.getByTestId("publish-p_101-confirm").click();
  await expect(page.getByTestId("scheduled-row-p_101")).toHaveCount(0);
  await expect(page.getByTestId("scheduled-row-p_102")).toBeVisible();
});

test("bulk publish now publishes the selected posts", async ({ page }) => {
  await page.goto("/en/scheduled");
  await page.getByTestId("scheduled-select-p_101").check();
  await page.getByTestId("scheduled-select-p_103").check();
  await page.getByTestId("publish-selected").click();
  await page.getByTestId("publish-selected-confirm").click();
  await expect(page.getByTestId("scheduled-row-p_101")).toHaveCount(0);
  await expect(page.getByTestId("scheduled-row-p_103")).toHaveCount(0);
});

test("with auto-publish off, the banner says so and nothing has a time (spec v1.1 §10)", async ({ page, context }) => {
  await setMockScenario(context, "manual");
  await page.goto("/en/scheduled");
  await expect(page.getByTestId("schedule-banner")).toHaveText("Auto-publish is off. Nothing goes out until someone presses Publish now.");
  await expect(page.getByTestId("scheduled-time-p_101")).toHaveText("Not scheduled");
});

test("the nav links to Scheduled, and Arabic titles read right to left", async ({ page }) => {
  await page.goto("/en");
  await page.getByTestId("nav-scheduled").click();
  await expect(page).toHaveURL(/\/en\/scheduled$/);
  await expect(page.getByTestId("scheduled-title-p_102").filter({ visible: true })).toHaveAttribute("dir", "rtl");
});

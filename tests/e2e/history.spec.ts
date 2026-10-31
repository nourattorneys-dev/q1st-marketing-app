import { expect, test } from "@playwright/test";
import { isolateMockStore, normalizeSpaces, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("lists published, failed and rejected posts with live links, times, targets and override reasons", async ({ page }) => {
  await page.goto("/en/history");
  await expect(page.getByTestId("history-url-p_301")).toHaveAttribute("href", "https://fakhernco.com/probation-period-uae-labour-law/");
  const time = normalizeSpaces(await page.getByTestId("history-time-p_301").innerText());
  expect(time).toContain("10:00");
  expect(time).toContain("AM");
  await expect(page.getByTestId("history-target-p_301")).toHaveText("WordPress");
  await expect(page.getByTestId("history-override-p_301")).toContainText("Length agreed with the client");
  await expect(page.getByTestId("history-error-p_303")).toHaveText("WordPress refused the request: 503 Service Unavailable.");
  await expect(page.getByTestId("history-note-p_304")).toContainText("Off-topic for this quarter");
  await expect(page.getByTestId("pager")).toHaveCount(0);
});

test("Retry after a refused publish is a new attempt, and the next one goes through (Review Focus 1)", async ({ page }) => {
  await page.goto("/en/history");
  const item = page.getByTestId("history-item-p_303");
  await item.getByTestId("history-retry-p_303").click();
  await expect(item.getByTestId("action-error")).toHaveText("WordPress refused the request: 503 Service Unavailable.");
  await item.getByTestId("history-retry-p_303").click();
  await expect(page.getByTestId("history-status-p_303")).toHaveText("Published");
  await expect(page.getByTestId("history-url-p_303")).toHaveAttribute("href", "https://fakhernco.com/gratuity-part-time-employees-uae/");
});

test("a post published from Scheduled shows first in History", async ({ page }) => {
  await page.goto("/en/scheduled");
  await page.getByTestId("publish-p_101").click();
  await page.getByTestId("publish-p_101-confirm").click();
  await expect(page.getByTestId("scheduled-row-p_101")).toHaveCount(0);
  await page.goto("/en/history");
  // The article and its translation go out together: both are at the top.
  const top = await page.locator('[data-testid^="history-item-"]').evaluateAll((items) => items.slice(0, 2).map((item) => item.getAttribute("data-testid")));
  expect(top.sort()).toEqual(["history-item-p_101", "history-item-p_102"]);
});

test("a page past the end says so and links back to the first page", async ({ page }) => {
  await page.goto("/en/history?page=9");
  await expect(page.getByTestId("list-page-empty")).toBeVisible();
  await page.getByTestId("list-first-page").click();
  await expect(page.getByTestId("history-item-p_301").filter({ visible: true })).toBeVisible();
});

test("a post the engine sent in an unknown shape is skipped with a note; the rest still shows (Review Focus 4)", async ({ page, context }) => {
  await setMockScenario(context, "drift");
  await page.goto("/en/review");
  await expect(page.getByTestId("list-skipped")).toHaveText("1 item couldn't be shown because the content engine sent it in an unexpected format.");
  await expect(page.getByTestId("card-p_201")).toBeVisible();
});

test("a page whose items all came in an unknown shape still says they were skipped (final review)", async ({ page, context }) => {
  await setMockScenario(context, "drift");
  await page.goto("/en/history?page=9");
  await expect(page.getByTestId("list-skipped")).toBeVisible();
});

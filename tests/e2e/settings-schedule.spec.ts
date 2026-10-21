import { expect, test } from "@playwright/test";
import { isolateMockStore, normalizeSpaces, signInWithCookie } from "./helpers";

const OFF = "Auto-publish is off. Nothing goes out until someone presses Publish now.";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("an admin finds Settings in the menu; a reviewer neither sees it nor can open it (Review Focus 5)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/schedule");
  await expect(page.getByTestId("nav-settings")).toHaveAttribute("href", "/en/settings/seo");
  await expect(page.getByTestId("nav-settings")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("settings-tab-schedule")).toHaveAttribute("aria-current", "page");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/settings/schedule");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("nav-settings")).toHaveCount(0);
});

test("turning auto-publish off shows on this page and on Scheduled", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/schedule");
  await page.getByTestId("schedule-auto-publish").uncheck();
  await expect(page.getByTestId("settings-unsaved")).toBeVisible();
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await expect(page.getByTestId("schedule-next-slot")).toHaveText(OFF);
  await page.goto("/en/scheduled");
  await expect(page.getByTestId("schedule-banner")).toHaveText(OFF);
});

test("one a day from 09:00: the next slot comes from the engine", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/schedule");
  await expect.poll(async () => normalizeSpaces(await page.getByTestId("schedule-next-slot").innerText())).toContain("10:00 AM");
  await page.getByTestId("schedule-per-day").fill("1");
  await page.getByTestId("schedule-from").fill("09:00");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await expect.poll(async () => normalizeSpaces(await page.getByTestId("schedule-next-slot").innerText())).toContain("9:00 AM");
});

test("a schedule that doesn't fit shows the engine's message next to the field", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/schedule");
  await page.getByTestId("schedule-per-day").fill("4");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-check-fields")).toBeVisible();
  await expect(page.getByTestId("field-error-perDay")).toContainText("don't fit");
});

test("a number that isn't whole is caught before saving; a day can be taken out", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/schedule");
  await page.getByTestId("schedule-gap").fill("1.5");
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("field-error-gapMinutes")).toHaveText("Enter a whole number.");
  await page.getByTestId("schedule-gap").fill("180");
  await page.getByTestId("schedule-day-thu").uncheck();
  await page.getByTestId("settings-save").click();
  await expect(page.getByTestId("settings-saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("schedule-day-thu")).not.toBeChecked();
});

test("works in Arabic: right to left, with Arabic day names", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/ar/settings/schedule");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("الإعدادات");
  await expect(page.getByTestId("schedule-day-label-sun")).toHaveText("الأحد");
});

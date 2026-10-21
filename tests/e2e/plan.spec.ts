import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("an admin sees the plan, its period, quota bars with this site's share, and this site's results", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/plan");
  await expect(page.getByTestId("plan-name")).toHaveText("Pro");
  await expect(page.getByTestId("plan-period")).toHaveText("Oct 1, 2026 – Oct 31, 2026");
  await expect(page.getByTestId("quota-articles")).toContainText("31 of 40");
  await expect(page.getByTestId("quota-site-articles")).toHaveText("This site: 24");
  await expect(page.getByTestId("results-published")).toHaveText("41");
  await expect(page.getByTestId("results-keywords")).toHaveText("12");
  await expect(page.getByTestId("results-live")).toHaveAttribute("href", "/en/history");
});

test("the usage chart covers six months for each metric the plan lists, a month with no numbers as 0 (Review Focus 3)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/plan");
  await expect(page.getByTestId("usage-articles").locator("li")).toHaveCount(6);
  await expect(page.getByTestId("usage-bar-articles-2026-05")).toHaveAttribute("aria-label", "May 2026: 12");
  await expect(page.getByTestId("usage-latest-articles")).toHaveText("24");
  await expect(page.getByTestId("usage-bar-videoMinutes-2026-10")).toHaveAttribute("aria-label", "Oct 2026: 0");
});

test("an admin requests an upgrade with a note", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/plan");
  await page.getByTestId("upgrade-metric").selectOption("articles");
  await page.getByTestId("upgrade-note").fill("Twenty more articles a month");
  await page.getByTestId("plan-request-upgrade").click();
  await expect(page.getByTestId("plan-upgrade-requested")).toBeVisible();
});

test("a reviewer has no Plan & usage item and is sent back from /plan", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/plan");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("nav-plan")).toHaveCount(0);
});

test("in Arabic, months are named in Arabic with Latin digits (Review Focus 5)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/ar/plan");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const label = await page.getByTestId("usage-bar-articles-2026-10").getAttribute("aria-label");
  expect(label).toContain("2026");
  expect(label).toMatch(/: 24$/);
  expect(label).not.toMatch(/[٠-٩]/);
});

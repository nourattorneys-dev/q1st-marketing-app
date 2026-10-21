import { expect, test } from "@playwright/test";
import { isolateMockStore, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("the dashboard shows this site's share of each quota this month (M1 follow-up)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await expect(page.getByTestId("quota-articles")).toContainText("31 of 40");
  await expect(page.getByTestId("quota-site-articles")).toHaveText("This site: 24");
  await expect(page.getByTestId("quota-site-aiTokens")).toHaveText("This site: 612,000");
});

test("with the limits reached, hard quotas show as reached on the dashboard (Review Focus 3)", async ({ page, context }) => {
  await setMockScenario(context, "quota");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await expect(page.getByTestId("quota-articles")).toHaveAttribute("data-state", "over");
  await expect(page.getByTestId("quota-siteScans")).toHaveAttribute("data-state", "over");
});

test("AI keyword proposals over the limit tell a reviewer to ask the admin (M3a follow-up)", async ({ page, context }) => {
  await setMockScenario(context, "quota");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/keywords");
  await page.getByTestId("propose-keywords").click();
  await expect(page.getByTestId("quota-exceeded")).toContainText("Monthly limit reached for AI tokens.");
  await expect(page.getByTestId("ask-admin")).toBeVisible();
});

test("SEO suggestions over the limit offer an admin Request upgrade (M3b follow-up)", async ({ page, context }) => {
  await setMockScenario(context, "quota");
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/settings/seo");
  await page.getByTestId("seo-propose").click();
  await expect(page.getByTestId("quota-exceeded")).toContainText("Monthly limit reached for AI tokens.");
  await page.getByTestId("request-upgrade").click();
  await expect(page.getByTestId("upgrade-requested")).toBeVisible();
});

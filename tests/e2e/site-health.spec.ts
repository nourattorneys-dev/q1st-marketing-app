import { expect, test } from "@playwright/test";
import { isolateMockStore, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("To do lists open and prepared findings; Applied and Dismissed have their own tabs", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  for (const id of ["sf_1", "sf_2", "sf_3", "sf_4"]) await expect(page.getByTestId(`finding-${id}`)).toBeVisible();
  await expect(page.getByTestId("finding-sf_5")).toHaveCount(0);
  await expect(page.getByTestId("finding-status-sf_3")).toHaveText("Fix prepared");
  await expect(page.getByTestId("finding-level-sf_1")).toHaveText("Critical");
  await page.getByTestId("finding-tab-applied").click();
  await expect(page.getByTestId("finding-sf_5").filter({ visible: true })).toBeVisible();
});

test("scanning shows progress and adds what it found (Review Focus 2)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  await page.getByTestId("site-scan").click();
  await expect(page.getByTestId("scan-job")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await expect(page.getByTestId("finding-sf_7")).toBeVisible();
});

test("Scan site stays unavailable while a scan runs, so a second click can't spend another scan (final review)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  await page.getByTestId("site-scan").click();
  await expect(page.getByTestId("scan-job")).toHaveAttribute("data-state", "running");
  await expect(page.getByTestId("site-scan")).toBeDisabled();
  await expect(page.getByTestId("scan-job")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await expect(page.getByTestId("site-scan")).toBeEnabled();
});

test("preparing fixes for the selected findings fills in the proposed fix", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  await expect(page.getByTestId("finding-select-sf_3")).toBeDisabled();
  await page.getByTestId("finding-select-sf_1").check();
  await page.getByTestId("prepare-fixes").click();
  await expect(page.getByTestId("prepare-job")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await expect(page.getByTestId("finding-status-sf_1")).toHaveText("Fix prepared");
  await expect(page.getByTestId("finding-fix-sf_1")).toContainText("legal consultants at Fakher & Co");
});

test("an admin applies a prepared fix after confirming; a reviewer sees no Apply (Review Focus 1)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  await expect(page.getByTestId("finding-dismiss-sf_3")).toBeVisible();
  await expect(page.getByTestId("finding-apply-sf_3")).toHaveCount(0);
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/site-health");
  await expect(page.getByTestId("finding-apply-sf_1")).toHaveCount(0);
  await page.getByTestId("finding-apply-sf_3").click();
  await page.getByTestId("finding-apply-sf_3-confirm").click();
  await expect(page.getByTestId("finding-sf_3")).toHaveCount(0);
  await page.goto("/en/site-health?tab=applied");
  await expect(page.getByTestId("finding-sf_3")).toBeVisible();
});

test("dismissing moves a finding to Dismissed", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  await page.getByTestId("finding-dismiss-sf_2").click();
  await expect(page.getByTestId("finding-sf_2")).toHaveCount(0);
  await page.goto("/en/site-health?tab=dismissed");
  await expect(page.getByTestId("finding-sf_2")).toBeVisible();
});

test("a scan over the monthly limit shows the quota message, and a reviewer is told to ask the admin (Review Focus 2)", async ({ page, context }) => {
  await setMockScenario(context, "quota");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/site-health");
  await page.getByTestId("site-scan").click();
  await expect(page.getByTestId("quota-exceeded")).toContainText("Monthly limit reached for Site scans.");
  await expect(page.getByTestId("ask-admin")).toBeVisible();
});

test("in Arabic, the page is right to left and an Arabic finding keeps its own direction (Review Focus 5)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/ar/site-health");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("finding-tab-todo")).toHaveText("للمعالجة");
  await expect(page.getByTestId("finding-issue-sf_4")).toHaveAttribute("dir", "auto");
  await expect(page.getByTestId("finding-issue-sf_4")).toHaveText("عنوان الصفحة أطول من 60 حرفاً");
});

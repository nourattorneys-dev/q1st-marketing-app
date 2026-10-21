import { expect, test } from "@playwright/test";
import { isolateMockStore, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("tabs list the right keywords; off-strategy ones sit with the dismissed", async ({ page }) => {
  await page.goto("/en/keywords");
  await expect(page.getByTestId("keyword-row-kw_3")).toBeVisible();
  await expect(page.getByTestId("keyword-row-kw_1")).toHaveCount(0);
  await expect(page.getByTestId("keyword-tab-dismissed")).toHaveAttribute("href", "/en/keywords?tab=dismissed");
  await page.goto("/en/keywords?tab=dismissed");
  await expect(page.getByTestId("keyword-off-strategy-kw_9")).toHaveText("Outside the strategy");
  await expect(page.getByTestId("keyword-row-kw_8")).toBeVisible();
});

test("adds keywords and names the ones already in the list (Review Focus 3)", async ({ page }) => {
  await page.goto("/en/keywords");
  await page.getByTestId("add-keywords-input").fill("labour court claims dubai,\nCommission  UAE labour law");
  await page.getByTestId("add-keywords").click();
  await expect(page.getByTestId("keywords-added")).toHaveText("Added 1 keyword.");
  await expect(page.getByTestId("keywords-skipped")).toHaveText("Already in the list: Commission UAE labour law.");
  await expect(page.locator('[data-testid^="keyword-phrase-"]', { hasText: "labour court claims dubai" })).toBeVisible();
});

test("approving moves selected keywords to In use; Restore brings a dismissed one back (Review Focus 4)", async ({ page }) => {
  await page.goto("/en/keywords");
  await page.getByTestId("keyword-select-kw_3").check();
  await page.getByTestId("keywords-approve").click();
  await expect(page.getByTestId("keyword-row-kw_3")).toHaveCount(0);
  await page.goto("/en/keywords?tab=inUse");
  await expect(page.getByTestId("keyword-row-kw_3")).toBeVisible();
  await page.goto("/en/keywords?tab=dismissed");
  await page.getByTestId("keyword-select-kw_9").check();
  await page.getByTestId("keywords-restore").click();
  await expect(page.getByTestId("keyword-row-kw_9")).toHaveCount(0);
});

test("AI keyword proposals appear in the New tab when the job is done (design §8)", async ({ page }) => {
  await page.goto("/en/keywords");
  await page.getByTestId("propose-keywords").click();
  await expect(page.getByTestId("propose-job")).toBeVisible();
  await expect(page.getByTestId("proposals-ready")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid^="keyword-phrase-"]', { hasText: "non-compete clause uae" })).toBeVisible();
});

test("proposing topics for selected keywords ends with a link to Topic ideas", async ({ page }) => {
  await page.goto("/en/keywords");
  await page.getByTestId("keyword-select-kw_5").check();
  await page.getByTestId("keywords-topics").click();
  await expect(page.getByTestId("topics-ready")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("open-ideas")).toHaveAttribute("href", "/en/ideas");
});

test("drafting articles asks for the language first, then a linked pair arrives in Review (Review Focus 5)", async ({ page }) => {
  await page.goto("/en/keywords");
  await page.getByTestId("keyword-select-kw_3").check();
  await page.getByTestId("keywords-draft").click();
  await page.getByTestId("keywords-draft-language-both").check();
  await page.getByTestId("keywords-draft-confirm").click();
  await expect(page.getByTestId("drafts-started")).toContainText("Drafting 2 articles");
  await expect(page.getByTestId("draft-job")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await page.goto("/en/review");
  await expect(page.getByText("End of service gratuity calculator uae: what you need to know", { exact: true })).toHaveCount(2);
});

test("with the monthly limit reached, a reviewer is told to ask the admin (Review Focus 1)", async ({ page, context }) => {
  await setMockScenario(context, "quota");
  await page.goto("/en/keywords");
  await page.getByTestId("keyword-select-kw_3").check();
  await page.getByTestId("keywords-draft").click();
  await page.getByTestId("keywords-draft-confirm").click();
  await expect(page.getByTestId("quota-exceeded")).toContainText("Monthly limit reached for Articles");
  await expect(page.getByTestId("ask-admin")).toBeVisible();
  await expect(page.getByTestId("request-upgrade")).toHaveCount(0);
});

test("with the monthly limit reached, an admin can request an upgrade (Review Focus 1)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await setMockScenario(context, "quota");
  await page.goto("/en/keywords");
  await page.getByTestId("keyword-select-kw_3").check();
  await page.getByTestId("keywords-draft").click();
  await page.getByTestId("keywords-draft-confirm").click();
  await page.getByTestId("request-upgrade").click();
  await expect(page.getByTestId("upgrade-requested")).toBeVisible();
});

test("Arabic keywords read right to left", async ({ page }) => {
  await page.goto("/en/keywords");
  await expect(page.getByTestId("keyword-phrase-kw_7")).toHaveAttribute("dir", "rtl");
});

test("more keywords than one request takes: Add waits, and the limit is said in Arabic (M3a follow-up; Review Focus 3)", async ({ page, context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/ar/keywords");
  await page.getByTestId("add-keywords-input").fill(Array.from({ length: 51 }, (_, i) => `keyword ${i + 1}`).join(", "));
  await expect(page.getByTestId("add-keywords")).toBeDisabled();
  await expect(page.getByTestId("keywords-limit")).toHaveText("أضف 50 كلمة مفتاحية كحدٍّ أقصى في كل مرة.");
});

import { expect, test } from "@playwright/test";
import { isolateMockStore, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("cards show the title, type, keywords and why; Arabic reads right to left; a drafted idea links to its drafts", async ({ page }) => {
  await page.goto("/en/ideas");
  const card = page.getByTestId("idea-card-sg_1");
  await expect(card).toContainText("Article");
  await expect(card).toContainText("end of service gratuity calculator uae");
  await expect(card).toContainText("Why: Keyword proposed, not covered yet");
  await expect(page.getByTestId("idea-title-sg_4")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("idea-post-p_201")).toHaveAttribute("href", "/en/review/p_201");
  await expect(page.getByTestId("idea-card-sg_6")).toHaveCount(0);
});

test("drafting an idea in both languages makes a linked pair that arrives in Review (Review Focus 5)", async ({ page }) => {
  await page.goto("/en/ideas");
  await page.getByTestId("idea-draft-sg_2").click();
  await page.getByTestId("idea-draft-sg_2-language-both").check();
  await page.getByTestId("idea-draft-sg_2-confirm").click();
  await expect(page.getByTestId("idea-job-sg_2")).toBeVisible();
  await expect(page.getByTestId("idea-drafted-sg_2")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("idea-card-sg_2").locator('[data-testid^="idea-post-"]')).toHaveCount(2);
  await page.goto("/en/review");
  await expect(page.locator('[data-testid^="card-title-"]', { hasText: "What a shareholders' agreement should say about deadlock" })).toHaveCount(2);
});

test("dismisses one idea, then two more in bulk", async ({ page }) => {
  await page.goto("/en/ideas");
  await page.getByTestId("idea-dismiss-sg_1").click();
  await expect(page.getByTestId("idea-card-sg_1")).toHaveCount(0);
  await page.getByTestId("idea-select-sg_2").check();
  await page.getByTestId("idea-select-sg_3").check();
  await page.getByTestId("ideas-dismiss-selected").click();
  await expect(page.getByTestId("idea-card-sg_2")).toHaveCount(0);
  await expect(page.getByTestId("idea-card-sg_3")).toHaveCount(0);
});

test("bulk drafting starts every selected idea", async ({ page }) => {
  await page.goto("/en/ideas");
  await page.getByTestId("idea-select-sg_1").check();
  await page.getByTestId("idea-select-sg_3").check();
  await page.getByTestId("ideas-draft-selected").click();
  await page.getByTestId("ideas-draft-selected-confirm").click();
  await expect(page.getByTestId("idea-drafting-sg_1").or(page.getByTestId("idea-drafted-sg_1"))).toBeVisible();
  await expect(page.getByTestId("idea-drafting-sg_3").or(page.getByTestId("idea-drafted-sg_3"))).toBeVisible();
});

test("a new request starts a draft that arrives in Review", async ({ page }) => {
  await page.goto("/en/ideas");
  await page.getByTestId("request-topic").fill("Annual leave rules for part-time staff");
  await page.getByTestId("request-submit").click();
  await expect(page.getByTestId("request-started")).toContainText("Drafting 1 post");
  await expect(page.getByTestId("request-job")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await page.goto("/en/review");
  await expect(page.getByText("Annual leave rules for part-time staff", { exact: true })).toBeVisible();
});

test("an article goes to the website and a social post to a social platform", async ({ page }) => {
  await page.goto("/en/ideas");
  await expect(page.getByTestId("request-platform").locator("option")).toHaveText(["Website"]);
  await page.getByTestId("request-kind").selectOption("social");
  await expect(page.getByTestId("request-platform").locator("option")).toHaveText(["LinkedIn", "Instagram"]);
});

test("with the monthly limit reached, drafting an idea or a new request shows the limit (Review Focus 1)", async ({ page, context }) => {
  await setMockScenario(context, "quota");
  await page.goto("/en/ideas");
  await page.getByTestId("idea-draft-sg_1").click();
  await page.getByTestId("idea-draft-sg_1-confirm").click();
  await expect(page.getByTestId("quota-exceeded")).toContainText("Monthly limit reached for Articles");
  await expect(page.getByTestId("ask-admin")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("request-topic").fill("Gratuity");
  await page.getByTestId("request-submit").click();
  await expect(page.getByTestId("quota-exceeded")).toBeVisible();
});

test("topics proposed from Keywords show up as new ideas", async ({ page }) => {
  await page.goto("/en/keywords");
  await page.getByTestId("keyword-select-kw_5").check();
  await page.getByTestId("keywords-topics").click();
  await expect(page.getByTestId("topics-ready")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("open-ideas").click();
  await expect(page.getByText("What to know about shareholder deadlock uae").filter({ visible: true })).toBeVisible();
});

test("a page past the end says so and links back to the first page (final review)", async ({ page }) => {
  await page.goto("/en/ideas?page=2");
  await expect(page.getByTestId("list-page-empty")).toBeVisible();
  await expect(page.getByTestId("list-first-page")).toHaveAttribute("href", "/en/ideas");
});

test("drafting one idea shows its own progress until it's done (final review)", async ({ page }) => {
  await page.goto("/en/ideas");
  await page.getByTestId("idea-draft-sg_1").click();
  await page.getByTestId("idea-draft-sg_1-confirm").click();
  await expect(page.getByTestId("idea-job-sg_1")).toBeVisible();
  await expect(page.getByTestId("idea-job-sg_1")).toHaveAttribute("data-state", "done", { timeout: 15_000 });
});

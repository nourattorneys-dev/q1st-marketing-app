import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("opens a post from the queue and saves a change", async ({ page }) => {
  await page.goto("/en/review");
  await page.getByTestId("card-title-p_201").click();
  await expect(page).toHaveURL(/\/en\/review\/p_201$/);
  await page.getByTestId("field-title").fill("Commission rules in the UAE");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("field-title")).toHaveValue("Commission rules in the UAE");
});

test("opening an article with lists isn't an edit, and undoing an edit clears it", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await expect(page.getByTestId("editor-body")).toContainText("The employee's performance");
  await expect(page.getByTestId("save")).toBeDisabled();
  await page.getByTestId("editor-body").click();
  await page.keyboard.type("x");
  await expect(page.getByTestId("save")).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("save")).toBeDisabled();
});

test("a second tab's save shows a conflict instead of overwriting (Review Focus 2)", async ({ page, context }) => {
  await page.goto("/en/review/p_201");
  const other = await context.newPage();
  await other.goto("/en/review/p_201");
  await other.getByTestId("field-title").fill("Saved in the other tab");
  await other.getByTestId("save").click();
  await expect(other.getByTestId("save-status")).toHaveText("Saved");

  await page.getByTestId("field-subtitle").fill("My new standfirst");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("conflict-panel")).toContainText("Title");
  await page.getByTestId("conflict-load-theirs").click();
  await expect(page.getByTestId("field-title")).toHaveValue("Saved in the other tab");
  await expect(page.getByTestId("conflict-panel")).toHaveCount(0);
});

test("a post someone else is editing is read-only until you take over", async ({ page }) => {
  await page.goto("/en/review/p_208");
  await expect(page.getByTestId("lock-banner")).toContainText("omar@example.com");
  await expect(page.getByTestId("field-title")).toBeDisabled();
  await page.getByTestId("takeover").click();
  await expect(page.getByTestId("lock-banner")).toHaveCount(0);
  await expect(page.getByTestId("field-title")).toBeEnabled();
});

test("shows checks, the SEO score and sources", async ({ page }) => {
  await page.goto("/en/review/p_203");
  await expect(page.getByTestId("checks-critical")).toContainText("The meta description is");
  await expect(page.getByTestId("seo-score")).toHaveText("SEO score 85");
  await page.goto("/en/review/p_201");
  await expect(page.getByTestId("sources")).toContainText("Federal Decree-Law No. 33 of 2021");
});

test("an Arabic post is edited right to left", async ({ page }) => {
  await page.goto("/en/review/p_202");
  await expect(page.getByTestId("editor-body")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("field-title")).toHaveAttribute("dir", "rtl");
});

test("a social post has a plain-text body and hashtags", async ({ page }) => {
  await page.goto("/en/review/p_206");
  await expect(page.getByTestId("field-hashtags")).toHaveValue("#UAELabourLaw, #Dubai");
  await expect(page.getByTestId("editor-body")).toHaveValue(/Resigning doesn't cancel/);
});

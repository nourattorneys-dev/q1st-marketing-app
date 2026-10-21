import { expect, test } from "@playwright/test";
import { BASE_URL } from "./constants";
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

test("taking over shows the holder's saved changes, so saving can't undo them (final review)", async ({ browser }) => {
  const store = `t${Date.now().toString(36)}take`;
  const contextFor = async (user: string) => {
    const context = await browser.newContext();
    await context.addCookies([
      { name: "mock_store", value: store, url: BASE_URL },
      { name: "dev_session", value: user, url: BASE_URL },
    ]);
    return context.newPage();
  };
  const holder = await contextFor("dev_admin");
  await holder.goto("/en/review/p_201");
  await expect(holder.getByTestId("field-title")).toBeEnabled();
  const me = await contextFor("dev_reviewer");
  await me.goto("/en/review/p_201");
  await expect(me.getByTestId("lock-banner")).toBeVisible();

  await holder.getByTestId("field-title").fill("Saved by the lock holder");
  await holder.getByTestId("save").click();
  await expect(holder.getByTestId("save-status")).toHaveText("Saved");

  await me.getByTestId("takeover").click();
  await expect(me.getByTestId("lock-banner")).toHaveCount(0);
  await expect(me.getByTestId("field-title")).toHaveValue("Saved by the lock holder");
  await expect(me.getByTestId("save")).toBeDisabled();
});

test("saving an edited body leaves nothing unsaved, though the engine stores it in its own form (final review)", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await expect(page.getByTestId("editor-body")).toContainText("The employee's performance");
  await page.getByTestId("editor-body").getByText("The employee's performance").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and conduct");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await expect(page.getByTestId("save")).toBeDisabled();
  await expect(page.getByTestId("approve")).toBeEnabled();
});

test("keep mine saves my edits on top of theirs and shows both versions (final review)", async ({ page, context }) => {
  await page.goto("/en/review/p_201");
  const other = await context.newPage();
  await other.goto("/en/review/p_201");
  await other.getByTestId("field-title").fill("Saved in the other tab");
  await other.getByTestId("save").click();
  await expect(other.getByTestId("save-status")).toHaveText("Saved");

  await page.getByTestId("field-subtitle").fill("My new standfirst");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("conflict-panel")).toContainText("Saved in the other tab");
  await expect(page.getByTestId("conflict-panel")).toContainText("My new standfirst");
  await page.getByTestId("conflict-keep-mine").click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByTestId("field-title")).toHaveValue("Saved in the other tab");
  await expect(page.getByTestId("field-subtitle")).toHaveValue("My new standfirst");
});

test("a field the engine refuses shows its message next to the field (final review)", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("field-slug").fill("Bad Slug!");
  await page.getByTestId("save").click();
  await expect(page.getByTestId("field-slug-error")).toBeVisible();
  await expect(page.getByTestId("field-slug")).toHaveAttribute("aria-invalid", "true");
});

test("a body with content the editor can't keep stays read-only; other fields stay editable (final review)", async ({ page }) => {
  await page.goto("/en/review/p_203");
  await expect(page.getByTestId("body-unsupported")).toContainText("details");
  await expect(page.getByTestId("editor-body")).toHaveAttribute("contenteditable", "false");
  await expect(page.getByTestId("field-title")).toBeEnabled();
});

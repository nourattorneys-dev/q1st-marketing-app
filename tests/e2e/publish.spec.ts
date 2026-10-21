import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { isolateMockStore, pageInSharedStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
});

test("publish now from the editor publishes the post and links to it live", async ({ page }) => {
  await page.goto("/en/review/p_201");
  await page.getByTestId("publish").click();
  await page.getByTestId("publish-confirm").click();
  await expect(page.getByTestId("post-status")).toHaveText("Published");
  await expect(page.getByTestId("published-link")).toHaveAttribute("href", "https://fakhernco.com/commission-payable-uae-labour-law/");
});

test("an Arabic twin whose structure doesn't match can't be published (spec v1.1 §10)", async ({ page }) => {
  await page.goto("/en/review/p_205");
  await expect(page.getByTestId("publish")).toBeDisabled();
  await expect(page.getByTestId("approve-blocked")).toBeVisible();
});

test("a post with a critical finding is approved with a reason before it can be published", async ({ page }) => {
  await page.goto("/en/review/p_203");
  await expect(page.getByTestId("publish")).toBeDisabled();
  await expect(page.getByTestId("publish-needs-approval")).toBeVisible();
});

test("exports Markdown and HTML through the dashboard's own server", async ({ page }) => {
  await page.goto("/en/review/p_201");
  const [markdown] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-md").click()]);
  expect(markdown.suggestedFilename()).toBe("commission-payable-uae-labour-law.md");
  expect(await readFile(await markdown.path(), "utf8")).toContain("## When the commission is earned");
  const [html] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-html").click()]);
  expect(html.suggestedFilename()).toBe("commission-payable-uae-labour-law.html");
});

test("while someone else holds the lock, the actions wait for Take over (M2a follow-up)", async ({ page }) => {
  await page.goto("/en/review/p_208");
  await expect(page.getByTestId("lock-banner")).toBeVisible();
  await expect(page.getByTestId("approve")).toBeDisabled();
  await expect(page.getByTestId("publish")).toBeDisabled();
  await page.getByTestId("takeover").click();
  await expect(page.getByTestId("approve")).toBeEnabled();
});

test("an action refused because someone else took over shows the lock banner, not an error", async ({ browser }) => {
  const store = `t${Date.now().toString(36)}lock`;
  const me = await pageInSharedStore(browser, store, "dev_reviewer");
  await me.goto("/en/review/p_201");
  await expect(me.getByTestId("field-title")).toBeEnabled();
  const other = await pageInSharedStore(browser, store, "dev_admin");
  await other.goto("/en/review/p_201");
  await other.getByTestId("takeover").click();
  await expect(other.getByTestId("lock-banner")).toHaveCount(0);

  await me.getByTestId("approve").click();
  await expect(me.getByTestId("lock-banner")).toContainText("admin@example.com");
  await expect(me.getByTestId("action-error")).toHaveCount(0);
  await expect(me.getByTestId("post-status")).toHaveText("Waiting for review");
});

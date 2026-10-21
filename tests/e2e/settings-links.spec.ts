import { expect, test } from "@playwright/test";
import { isolateMockStore, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("an admin's connection warnings link to the page that fixes them; a reviewer gets no links", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en");
  await expect(page.getByTestId("connection-fix-linkedin")).toHaveAttribute("href", "/en/settings/social");
  await expect(page.getByTestId("connection-fix-instagram")).toHaveAttribute("href", "/en/settings/social");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await expect(page.getByTestId("connection-linkedin")).toBeVisible();
  await expect(page.getByTestId("connection-fix-linkedin")).toHaveCount(0);
});

test("first run: the dashboard sends an admin to the website connection, and saving it moves on to social accounts (spec v1.1 §6, Review Focus 5)", async ({ page, context }) => {
  await setMockScenario(context, "firstrun");
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/settings\/website$/);
  await expect(page.getByTestId("website-status")).toHaveAttribute("data-status", "missing");
  await page.getByTestId("website-field-url").fill("https://fakhernco.com");
  await page.getByTestId("website-field-username").fill("articles-ai");
  await page.getByTestId("website-field-secret").fill("first-application-password");
  await page.getByTestId("website-test").click();
  await expect(page.getByTestId("website-test-result")).toHaveAttribute("data-ok", "true");
  await page.getByTestId("settings-save").click();
  await expect(page).toHaveURL(/\/en\/settings\/social$/);
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("connection-website")).toHaveCount(0);
});

test("first run: a reviewer stays on the dashboard and is told to ask the admin", async ({ page, context }) => {
  await setMockScenario(context, "firstrun");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await expect(page.getByTestId("connection-website")).toHaveAttribute("data-status", "missing");
  await expect(page.getByTestId("connections-help")).toHaveText("Ask your admin to fix this.");
  await expect(page).toHaveURL(/\/en$/);
});

test("publishing with no website connection: a reviewer is told to ask the admin, an admin gets a link (design §9, Review Focus 5)", async ({ page, context }) => {
  await setMockScenario(context, "firstrun");
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/scheduled");
  await page.getByTestId("publish-p_101").click();
  await page.getByTestId("publish-p_101-confirm").click();
  await expect(page.getByTestId("not-connected")).toContainText("The website isn't connected, so this can't be published.");
  await expect(page.getByTestId("not-connected-ask-admin")).toBeVisible();
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en/scheduled");
  await page.getByTestId("publish-p_101").click();
  await page.getByTestId("publish-p_101-confirm").click();
  await expect(page.getByTestId("not-connected-fix")).toHaveAttribute("href", "/en/settings/website");
});

import { expect, test } from "@playwright/test";
import { isolateMockStore, normalizeSpaces, setMockScenario, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_admin");
});

test("lists LinkedIn, expiring with when its access ends, and Instagram not connected; no Search Console without the feature", async ({ page }) => {
  await page.goto("/en/settings/social");
  await expect(page.getByTestId("social-status-linkedin")).toHaveAttribute("data-status", "expiring");
  await expect.poll(async () => normalizeSpaces(await page.getByTestId("social-expires-linkedin").innerText())).toContain("Oct 30");
  await expect(page.getByTestId("social-connect-linkedin")).toHaveText("Reconnect");
  await expect(page.getByTestId("social-status-instagram")).toHaveAttribute("data-status", "missing");
  await expect(page.getByTestId("social-connect-instagram")).toHaveText("Connect");
  await expect(page.getByTestId("social-row-searchConsole")).toHaveCount(0);
});

test("connecting Instagram goes through the engine's address and comes back connected; the dashboard stops warning", async ({ page }) => {
  await page.goto("/en/settings/social");
  await page.getByTestId("social-connect-instagram").click();
  await page.waitForURL(/\/en\/settings\/social\?connected=instagram$/);
  await expect(page.getByTestId("social-connected")).toHaveText("Instagram connected.");
  await expect(page.getByTestId("social-status-instagram")).toHaveAttribute("data-status", "ok");
  await page.goto("/en");
  await expect(page.getByTestId("connection-linkedin")).toBeVisible();
  await expect(page.getByTestId("connection-instagram")).toHaveCount(0);
});

test("disconnecting asks first, then the account shows as not connected", async ({ page }) => {
  await page.goto("/en/settings/social");
  await page.getByTestId("social-disconnect-linkedin").click();
  await page.getByTestId("social-disconnect-linkedin-confirm").click();
  await expect(page.getByTestId("social-status-linkedin")).toHaveAttribute("data-status", "missing");
  await expect(page.getByTestId("social-disconnect-linkedin")).toHaveCount(0);
});

test("Google Search Console is offered with the performance feature, through the same round trip", async ({ page, context }) => {
  await setMockScenario(context, "performance");
  await page.goto("/en/settings/social");
  await expect(page.getByTestId("social-status-searchConsole")).toHaveAttribute("data-status", "missing");
  await page.getByTestId("social-connect-searchConsole").click();
  await page.waitForURL(/\?connected=searchConsole$/);
  await expect(page.getByTestId("social-connected")).toHaveText("Google Search Console connected.");
  await expect(page.getByTestId("social-status-searchConsole")).toHaveAttribute("data-status", "ok");
});

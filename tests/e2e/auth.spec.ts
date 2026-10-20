import { expect, test } from "@playwright/test";
import { signInWithCookie } from "./helpers";

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test("a reviewer signs in and sees their name and role", async ({ page }) => {
  await page.goto("/en/sign-in");
  await page.getByTestId("sign-in-dev_reviewer").click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("user-name")).toHaveText("Reviewer (test)");
  await expect(page.getByTestId("user-role")).toHaveText("Reviewer");
  await expect(page.getByTestId("nav-dashboard")).toBeVisible();
});

test("a user without a role is sent to the no-access page", async ({ page, context }) => {
  await signInWithCookie(context, "dev_norole");
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/no-access$/);
});

test("signing out returns to sign-in and stays signed out", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en");
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
});

test("switching language keeps the page and flips the direction", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await page.getByTestId("locale-switch").click();
  await expect(page).toHaveURL(/\/ar$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  // Next 16 keeps up to 3 previous routes in the DOM (hidden via <Activity>), so match only the visible badge.
  await expect(page.getByTestId("user-role").filter({ visible: true })).toHaveText("مراجع");
});

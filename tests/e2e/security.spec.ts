import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

const REQUIRED = "Your role is Admin, so two-factor login is required. Turn it on to continue: you'll enter a code from an authenticator app each time you sign in.";
const RECOMMENDED = "Two-factor login is recommended: each time you sign in, you'll also enter a code from an authenticator app.";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
});

test("an admin without two-factor login reaches only the setup page until it's on (design §5; Review Focus 2)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin_no2fa");
  for (const path of ["/en", "/en/keywords", "/en/users", "/en/settings/seo"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/en\/security$/);
  }
  await expect(page.getByTestId("security-status")).toHaveText(REQUIRED);
  await expect(page.getByTestId("security-continue")).toHaveCount(0);

  await page.getByTestId("security-enable").click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByTestId("user-name").filter({ visible: true })).toHaveText("Admin without two-factor (test)");
  await page.goto("/en/security");
  await expect(page.getByTestId("security-status")).toHaveText("Two-factor login is on.");
  await expect(page.getByTestId("security-continue")).toBeVisible();
  await page.goto("/en/users");
  await expect(page.getByTestId("user-twofactor-dev_admin_no2fa")).toHaveText("On");
});

test("a reviewer without two-factor login is only reminded (design §5)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en/keywords");
  await expect(page).toHaveURL(/\/en\/keywords$/);
  await expect(page.getByTestId("user-security")).toHaveText("Turn on two-factor login");
  await page.getByTestId("user-security").click();
  await expect(page).toHaveURL(/\/en\/security$/);
  await expect(page.getByTestId("security-status")).toHaveText(RECOMMENDED);
  await expect(page.getByTestId("security-continue")).toBeVisible();
});

test("someone with two-factor login on sees Security in the menu", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en");
  await expect(page.getByTestId("user-security")).toHaveText("Security");
  await page.goto("/en/security");
  await expect(page.getByTestId("security-status")).toHaveText("Two-factor login is on.");
  await expect(page.getByTestId("security-enable")).toHaveCount(0);
});

test("the security page sends signed-out visitors to sign-in, and people without a role to no-access", async ({ page, context }) => {
  await page.goto("/en/security");
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  await signInWithCookie(context, "dev_norole");
  await page.goto("/en/security");
  await expect(page).toHaveURL(/\/en\/no-access$/);
});

test("the security page in Arabic", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin_no2fa");
  await page.goto("/ar");
  await expect(page).toHaveURL(/\/ar\/security$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("security-status")).toHaveAttribute("data-status", "required");
  await expect(page.getByTestId("security-enable")).toHaveText("فعّل تسجيل الدخول بخطوتين (تجريبي)");
});

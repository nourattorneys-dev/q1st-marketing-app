import { expect, test } from "@playwright/test";
import { isolateMockStore, signInWithCookie } from "./helpers";

test.beforeEach(async ({ context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_admin");
});

test("with one website, the header names it and offers no switcher, in English and Arabic (P1b)", async ({ page }) => {
  await page.goto("/en");
  await expect(page.getByTestId("site-name")).toHaveText("Fakher & Co");
  await expect(page.getByTestId("site-switcher")).toHaveCount(0);
  await page.goto("/ar");
  await expect(page.getByTestId("site-name")).toHaveAttribute("title", "الموقع");
});

test("the Users page offers no site checkboxes when the client has one website (P1b)", async ({ page }) => {
  await page.goto("/en/users");
  await expect(page.getByTestId("invite-email")).toBeVisible();
  await expect(page.getByTestId("invite-sites")).toHaveCount(0);
});

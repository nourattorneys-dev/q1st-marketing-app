import { expect, test } from "@playwright/test";
import { BASE_URL } from "./constants";

test("the root address opens English by default", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en(\/|$)/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("Arabic pages are right to left", async ({ page }) => {
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("the root address remembers Arabic", async ({ page, context }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "ar", url: BASE_URL }]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/ar(\/|$)/);
});

import { expect, test } from "@playwright/test";
import { signInWithCookie } from "./helpers";

test("the light theme uses the prototype's warm background", async ({ page }) => {
  await page.goto("/en/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(246, 245, 242)");
});

test("a saved dark theme applies before the page shows", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/en/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(19, 19, 18)");
});

test("the theme toggle switches and remembers the theme", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

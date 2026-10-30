import { expect, test } from "@playwright/test";
import { signInWithCookie } from "./helpers";

test("the light theme uses the Quantum1st Paper background", async ({ page }) => {
  await page.goto("/en/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(244, 243, 238)");
});

test("a saved dark theme applies before the page shows", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.goto("/en/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(7, 9, 15)");
});

test("the theme toggle switches and remembers the theme", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("dark mode survives a language switch", async ({ page, context }) => {
  await signInWithCookie(context, "dev_reviewer");
  await page.goto("/en");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("locale-switch").click();
  await expect(page).toHaveURL(/\/ar$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

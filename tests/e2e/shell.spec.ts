import { expect, test } from "@playwright/test";
import { isolateMockStore, setMockScenario, signInWithCookie } from "./helpers";

test("a revoked key shows one site-wide banner (design §9)", async ({ page, context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
  await setMockScenario(context, "unauthorized");
  await page.goto("/en/review");
  await expect(page.getByTestId("service-banner")).toHaveText("Service unavailable, contact Quantum1st.");
  await expect(page.getByTestId("service-banner")).toHaveCount(1);
});

test("an unexpected failure shows a translated error page with Try again", async ({ page, context }) => {
  await isolateMockStore(context);
  await signInWithCookie(context, "dev_reviewer");
  await setMockScenario(context, "crash");
  await page.goto("/ar/review");
  await expect(page.getByTestId("error-page")).toContainText("حدث خطأ");
  await expect(page.getByTestId("error-retry")).toBeVisible();
});

test("the sign-in page switches to Arabic (M1 follow-up)", async ({ page }) => {
  await page.goto("/en/sign-in");
  await page.getByTestId("locale-switch").click();
  await expect(page).toHaveURL(/\/ar\/sign-in$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("the no-access page has the language switch (M1 follow-up)", async ({ page, context }) => {
  await signInWithCookie(context, "dev_norole");
  await page.goto("/en/no-access");
  await expect(page.getByTestId("locale-switch")).toBeVisible();
});

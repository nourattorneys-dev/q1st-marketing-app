import { expect, test } from "@playwright/test";
import { BASE_URL, E2E_ENGINE_KEY } from "./constants";
import { normalizeSpaces, setMockScenario, signInWithCookie } from "./helpers";

test.describe("dashboard, signed in as a reviewer", () => {
  test.beforeEach(async ({ context }) => {
    await signInWithCookie(context, "dev_reviewer");
  });

  test("shows the site's counts", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByTestId("stat-suggestions-value")).toHaveText("8");
    await expect(page.getByTestId("stat-pending-value")).toHaveText("3");
    await expect(page.getByTestId("stat-scheduled-value")).toHaveText("5");
    await expect(page.getByTestId("stat-published-value")).toHaveText("41");
    await expect(page.getByTestId("stat-failed-value")).toHaveText("1");
  });

  test("shows the next publish slot in 12-hour Dubai time", async ({ page }) => {
    await page.goto("/en");
    const text = normalizeSpaces(await page.getByTestId("next-slot-time").innerText());
    expect(text).toContain("Oct 22");
    expect(text).toContain("10:00 AM");
  });

  test("lists broken connections and tells a reviewer to ask the admin", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByTestId("connection-linkedin")).toHaveAttribute("data-status", "expiring");
    await expect(page.getByTestId("connection-instagram")).toHaveAttribute("data-status", "missing");
    await expect(page.getByTestId("connection-website")).toHaveCount(0);
    await expect(page.getByTestId("connections-help")).toHaveText("Ask your admin to fix this.");
  });

  test("shows quota states, and a metric the interface doesn't know spelled out, never raw", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByTestId("quota-articles")).toHaveAttribute("data-state", "ok");
    await expect(page.getByTestId("quota-socialPosts")).toHaveAttribute("data-state", "warning");
    await expect(page.getByTestId("quota-socialPosts")).toContainText("110 of 120");
    await expect(page.getByTestId("quota-photos")).toHaveAttribute("data-state", "unlimited");
    await expect(page.getByTestId("quota-videoMinutes")).toContainText("Video minutes");
  });

  test("works in Arabic with Latin digits and Dubai time", async ({ page }) => {
    await page.goto("/ar");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("لوحة التحكم");
    await expect(page.getByTestId("stat-published-value")).toHaveText("41");
    const slot = normalizeSpaces(await page.getByTestId("next-slot-time").innerText());
    expect(slot).toContain("10:00");
    expect(slot).toContain("ص");
  });
});

test("an admin is told to fix connections in Settings", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  await page.goto("/en");
  await expect(page.getByTestId("connections-help")).toHaveText("Fix this in Settings.");
});

test.describe("engine problems", () => {
  test.beforeEach(async ({ context }) => {
    await signInWithCookie(context, "dev_reviewer");
  });

  test("a revoked key shows the service-unavailable message", async ({ page, context }) => {
    await setMockScenario(context, "unauthorized");
    await page.goto("/en");
    await expect(page.getByTestId("engine-notice").first()).toHaveText("Service unavailable, contact Quantum1st.");
  });

  test("an unreachable engine shows a try-again message", async ({ page, context }) => {
    await setMockScenario(context, "down");
    await page.goto("/en");
    await expect(page.getByTestId("engine-notice").first()).toHaveText(
      "The content engine can't be reached right now. Try again shortly.",
    );
  });

  test("a changed response shape breaks only the sections that use it", async ({ page, context }) => {
    await setMockScenario(context, "drift");
    await page.goto("/en");
    await expect(page.getByTestId("engine-notice").first()).toHaveAttribute("data-code", "invalid_response");
    await expect(page.getByTestId("engine-notice")).toHaveCount(1);
    await expect(page.getByTestId("next-slot-time")).toBeVisible();
    await expect(page.getByTestId("connection-linkedin")).toBeVisible();
    await expect(page.getByTestId("quota-articles")).toBeVisible();
  });
});

test("the engine API key never reaches the browser", async ({ page, context }) => {
  await signInWithCookie(context, "dev_admin");
  const bodies: string[] = [];
  const origins = new Set<string>();

  page.on("request", (request) => {
    if (request.url().startsWith("http")) origins.add(new URL(request.url()).origin);
  });
  page.on("response", async (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (/text|javascript|json|x-component/.test(type)) {
      try {
        bodies.push(await response.text());
      } catch {
        // Redirect responses have no readable body.
      }
    }
  });

  await page.goto("/en");
  await expect(page.getByTestId("stat-pending-value")).toHaveText("3");
  await page.waitForLoadState("networkidle");

  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) expect(body).not.toContain(E2E_ENGINE_KEY);
  expect([...origins]).toEqual([BASE_URL]);
});

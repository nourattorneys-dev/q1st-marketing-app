import type { BrowserContext } from "@playwright/test";
import { BASE_URL } from "./constants";

export type TestUser = "dev_admin" | "dev_reviewer" | "dev_norole";

export async function signInWithCookie(context: BrowserContext, user: TestUser): Promise<void> {
  await context.addCookies([{ name: "dev_session", value: user, url: BASE_URL }]);
}

export async function setMockScenario(
  context: BrowserContext,
  scenario: "normal" | "unauthorized" | "down" | "drift",
): Promise<void> {
  await context.addCookies([{ name: "mock_scenario", value: scenario, url: BASE_URL }]);
}

/** ICU uses narrow no-break spaces in times; compare with plain spaces. */
export function normalizeSpaces(text: string): string {
  return text.replace(/\s+/gu, " ");
}

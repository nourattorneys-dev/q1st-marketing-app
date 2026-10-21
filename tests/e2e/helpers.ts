import type { Browser, BrowserContext, Page } from "@playwright/test";
import { BASE_URL } from "./constants";

export type TestUser = "dev_admin" | "dev_reviewer" | "dev_norole";

export async function signInWithCookie(context: BrowserContext, user: TestUser): Promise<void> {
  await context.addCookies([{ name: "dev_session", value: user, url: BASE_URL }]);
}

export async function setMockScenario(
  context: BrowserContext,
  scenario: "normal" | "unauthorized" | "down" | "drift" | "manual" | "crash" | "quota",
): Promise<void> {
  await context.addCookies([{ name: "mock_scenario", value: scenario, url: BASE_URL }]);
}

/** ICU uses narrow no-break spaces in times; compare with plain spaces. */
export function normalizeSpaces(text: string): string {
  return text.replace(/\s+/gu, " ");
}

/** Gives this test its own copy of the mock engine's data, so tests can't affect each other. */
export async function isolateMockStore(context: BrowserContext): Promise<void> {
  const namespace = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await context.addCookies([{ name: "mock_store", value: namespace, url: BASE_URL }]);
}

/** A page for `user` on a mock engine shared with other pages (same store namespace), for two-person tests. */
export async function pageInSharedStore(browser: Browser, store: string, user: TestUser): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "mock_store", value: store, url: BASE_URL },
    { name: "dev_session", value: user, url: BASE_URL },
  ]);
  return context.newPage();
}

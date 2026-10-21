"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asAppLocale } from "@/i18n/locales";
import { MOCK_STORE_COOKIE } from "@/lib/engine/mock/registry";
import { serverEnv } from "@/lib/env";
import { createMockDirectory } from "@/lib/users/mock-directory";
import { decodeMockSession, MOCK_SESSION_COOKIE } from "./mock-session";

function assertMockMode(): void {
  if (serverEnv().authMode !== "mock") throw new Error("Test logins are disabled (AUTH_MODE is not mock).");
}

export async function signInAsMockUser(formData: FormData): Promise<void> {
  assertMockMode();
  const locale = asAppLocale(String(formData.get("locale") ?? ""));
  const userId = String(formData.get("userId") ?? "");
  if (!decodeMockSession(userId)) throw new Error("Unknown test user.");
  (await cookies()).set(MOCK_SESSION_COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect(`/${locale}`);
}

export async function signOutMockUser(formData: FormData): Promise<void> {
  assertMockMode();
  const locale = asAppLocale(String(formData.get("locale") ?? ""));
  (await cookies()).delete(MOCK_SESSION_COOKIE);
  redirect(`/${locale}/sign-in`);
}

/** Test logins only: stands in for setting up an authenticator app (design §5), for this mock_store namespace. */
export async function enableMockTwoFactor(formData: FormData): Promise<void> {
  assertMockMode();
  const locale = asAppLocale(String(formData.get("locale") ?? ""));
  const jar = await cookies();
  const user = decodeMockSession(jar.get(MOCK_SESSION_COOKIE)?.value);
  if (!user) redirect(`/${locale}/sign-in`);
  createMockDirectory(jar.get(MOCK_STORE_COOKIE)?.value).enableTwoFactor(user.userId);
  // On to the dashboard: a refresh of this page (outside the app shell) doesn't redraw it in Next 16.4.
  redirect(`/${locale}`);
}

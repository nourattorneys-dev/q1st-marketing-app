"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asAppLocale } from "@/i18n/locales";
import { serverEnv } from "@/lib/env";
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

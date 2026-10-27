"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asAppLocale } from "@/i18n/locales";
import { sessionCookieName, sessionCookieOptions } from "@/lib/accounts/cookie";
import { completeReset, type ResetProblem } from "@/lib/accounts/resets";
import { formText } from "@/lib/actions/form";
import { getAccountStore } from "@/lib/db";
import { passwordEnv } from "@/lib/env";

export type ResetState = { problem: ResetProblem | "mismatch" } | null;

/** Spec M5c: sets the new password, ends every other session, and signs the person in here. */
export async function resetPasswordAction(_previous: ResetState, form: FormData): Promise<ResetState> {
  const env = passwordEnv();
  const locale = asAppLocale(formText(form, "locale"));
  const password = formText(form, "password");
  if (password !== formText(form, "confirm")) return { problem: "mismatch" };
  const result = await completeReset(getAccountStore(), { token: formText(form, "token", 200), password, now: new Date() });
  if (!result.ok) return { problem: result.problem };
  (await cookies()).set(sessionCookieName(env.appUrl), result.token, sessionCookieOptions(env.appUrl, result.expiresAt));
  redirect(`/${locale}`);
}

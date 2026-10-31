"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asAppLocale } from "@/i18n/locales";
import { sessionCookieName } from "@/lib/accounts/cookie";
import type { PasswordProblem } from "@/lib/accounts/passwords";
import { changePassword } from "@/lib/accounts/sign-in";
import { formText } from "@/lib/actions/form";
import { requireSession } from "@/lib/auth/session";
import { getAccountStore } from "@/lib/db";
import { passwordEnv } from "@/lib/env";

export type ChangeState = { changed: true } | { problem: "current" | "locked" | "mismatch" | PasswordProblem } | null;

/** Spec M5c, the Account page: the current password, then the new one twice. This session stays; every other one ends. */
export async function changePasswordAction(_previous: ChangeState, form: FormData): Promise<ChangeState> {
  const env = passwordEnv();
  const locale = asAppLocale(formText(form, "locale"));
  const session = await requireSession(locale);
  const next = formText(form, "password");
  if (next !== formText(form, "confirm")) return { problem: "mismatch" };
  const store = getAccountStore();
  const account = await store.account(session.userId);
  if (!account) redirect(`/${locale}/sign-in`);
  const keepToken = (await cookies()).get(sessionCookieName(env))?.value ?? "";
  const result = await changePassword(store, { account, current: formText(form, "current"), next, keepToken, now: new Date() });
  return result.ok ? { changed: true } : { problem: result.problem };
}

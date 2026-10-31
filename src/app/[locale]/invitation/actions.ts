"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asAppLocale } from "@/i18n/locales";
import { sessionCookieName, sessionCookieOptions } from "@/lib/accounts/cookie";
import { acceptInvitation, type AcceptProblem } from "@/lib/accounts/invitations";
import { formText } from "@/lib/actions/form";
import { getAccountStore } from "@/lib/db";
import { passwordEnv } from "@/lib/env";

export type AcceptState = { problem: AcceptProblem | "mismatch"; name: string } | null;

/** Spec M5c: the invitation page's form. Success creates the account, signs the person in and opens the dashboard. */
export async function acceptInvitationAction(_previous: AcceptState, form: FormData): Promise<AcceptState> {
  const env = passwordEnv();
  const locale = asAppLocale(formText(form, "locale"));
  const name = formText(form, "name", 400);
  const password = formText(form, "password");
  if (password !== formText(form, "confirm")) return { problem: "mismatch", name };
  const result = await acceptInvitation(getAccountStore(), { token: formText(form, "token", 200), name, password, now: new Date() });
  if (!result.ok) return { problem: result.problem, name };
  (await cookies()).set(sessionCookieName(env), result.token, sessionCookieOptions(env, result.expiresAt));
  redirect(`/${locale}`);
}

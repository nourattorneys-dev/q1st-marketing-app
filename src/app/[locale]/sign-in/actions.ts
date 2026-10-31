"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { asAppLocale } from "@/i18n/locales";
import { sessionCookieName, sessionCookieOptions } from "@/lib/accounts/cookie";
import { clientAddress } from "@/lib/accounts/request";
import { signIn } from "@/lib/accounts/sign-in";
import { formText } from "@/lib/actions/form";
import { getAccountStore } from "@/lib/db";
import { passwordEnv } from "@/lib/env";

export type SignInState = { error: "wrong" | "locked" | "invalid"; email: string } | null;

/** Spec M5c: our sign-in form. A refusal comes back to the form, keeping the email; success sets the session cookie and opens the dashboard. */
export async function signInAction(_previous: SignInState, form: FormData): Promise<SignInState> {
  const env = passwordEnv();
  const locale = asAppLocale(formText(form, "locale"));
  const email = formText(form, "email", 320);
  const password = formText(form, "password");
  if (!email.trim() || !password) return { error: "invalid", email };
  const address = clientAddress((await headers()).get("x-forwarded-for"));
  const result = await signIn(getAccountStore(), { email, password, address, now: new Date() });
  if (!result.ok) return { error: result.reason, email };
  (await cookies()).set(sessionCookieName(env), result.token, sessionCookieOptions(env, result.expiresAt));
  redirect(`/${locale}`);
}

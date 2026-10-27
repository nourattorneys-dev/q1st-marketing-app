"use server";

import { after } from "next/server";
import { requestReset } from "@/lib/accounts/resets";
import { formText } from "@/lib/actions/form";
import { getAccountStore } from "@/lib/db";
import { passwordEnv } from "@/lib/env";
import { mailerFor } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";

export type ForgotState = { sent: true } | { problem: "empty" } | null;

/** Spec M5c: always the same answer. The email goes out after it (Next's after()), so the time taken says nothing either. */
export async function requestResetAction(_previous: ForgotState, form: FormData): Promise<ForgotState> {
  const env = passwordEnv();
  const email = formText(form, "email", 320);
  if (!email.trim()) return { problem: "empty" };
  await requestReset(
    { store: getAccountStore(), mailer: mailerFor(servicesEnv()), appUrl: env.appUrl, later: (task) => after(task) },
    { email, now: new Date() },
  );
  return { sent: true };
}

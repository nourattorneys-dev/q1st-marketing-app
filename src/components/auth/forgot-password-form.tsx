"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { requestResetAction, type ForgotState } from "@/app/[locale]/forgot-password/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Spec M5c: one email field; the answer is the same whatever the email. */
export function ForgotPasswordForm() {
  const t = useTranslations("ForgotPassword");
  const [state, action, pending] = useActionState<ForgotState, FormData>(requestResetAction, null);

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="forgot-email">{t("email")}</Label>
        <Input id="forgot-email" name="email" type="email" dir="ltr" autoComplete="username" data-testid="forgot-email" />
      </div>
      {state && "sent" in state && (
        <p role="status" data-testid="forgot-sent" className="text-sm text-ok-fg">
          {t("sent")}
        </p>
      )}
      {state && "problem" in state && (
        <p role="alert" data-testid="forgot-error" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
          {t("empty")}
        </p>
      )}
      <Button type="submit" disabled={pending} data-testid="forgot-submit">
        {pending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}

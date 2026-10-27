"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { resetPasswordAction, type ResetState } from "@/app/[locale]/reset-password/actions";
import { Button } from "@/components/ui/button";
import { NewPasswordFields } from "./new-password-fields";

export function ResetPasswordForm({ locale, token }: { locale: string; token: string }) {
  const t = useTranslations("ResetPassword");
  const tPassword = useTranslations("Password");
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordAction, null);

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      <NewPasswordFields idPrefix="reset" label={t("password")} />
      {state && (
        <p role="alert" data-testid="reset-error" data-problem={state.problem} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
          {state.problem === "invalid" ? t("invalid") : tPassword(state.problem)}
        </p>
      )}
      <Button type="submit" disabled={pending} data-testid="reset-submit">
        {pending ? t("saving") : t("submit")}
      </Button>
    </form>
  );
}

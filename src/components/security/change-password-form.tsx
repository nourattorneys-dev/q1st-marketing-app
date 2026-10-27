"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { changePasswordAction, type ChangeState } from "@/app/[locale]/security/actions";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Spec M5c: the current password, then the new one twice. This session stays; the person's other sessions end. */
export function ChangePasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("Account");
  const tPassword = useTranslations("Password");
  const [state, action, pending] = useActionState<ChangeState, FormData>(changePasswordAction, null);

  return (
    <form action={action} noValidate aria-labelledby="account-change" className="flex flex-col gap-4">
      <h2 id="account-change" className="font-medium">
        {t("change")}
      </h2>
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-current">{t("current")}</Label>
        <Input id="account-current" name="current" type="password" dir="ltr" autoComplete="current-password" data-testid="account-current" />
      </div>
      <NewPasswordFields idPrefix="account" label={t("password")} />
      {state && "changed" in state && (
        <p role="status" data-testid="account-changed" className="text-sm text-ok-fg">
          {t("changed")}
        </p>
      )}
      {state && "problem" in state && (
        <p role="alert" data-testid="account-error" data-problem={state.problem} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
          {tPassword(state.problem)}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending} data-testid="account-submit">
          {pending ? t("saving") : t("submit")}
        </Button>
      </div>
    </form>
  );
}

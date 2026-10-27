"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { acceptInvitationAction, type AcceptState } from "@/app/[locale]/invitation/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NewPasswordFields } from "./new-password-fields";

const LINK_PROBLEMS = new Set(["invalid", "expired", "taken"]);

/** Spec M5c: the invited email is shown, not editable; the person chooses a name and a password. */
export function AcceptInvitationForm({ locale, token, email }: { locale: string; token: string; email: string }) {
  const t = useTranslations("Invitation");
  const tPassword = useTranslations("Password");
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptInvitationAction, null);
  const problem = state?.problem;

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invitation-email">{t("email")}</Label>
        <Input id="invitation-email" type="email" dir="ltr" autoComplete="username" value={email} readOnly data-testid="invitation-email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invitation-name">{t("name")}</Label>
        <Input id="invitation-name" name="name" autoComplete="name" defaultValue={state?.name} data-testid="invitation-name" />
      </div>
      <NewPasswordFields idPrefix="invitation" label={t("password")} />
      {problem && (
        <p role="alert" data-testid="invitation-error" data-problem={problem} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
          {LINK_PROBLEMS.has(problem) ? t(problem) : tPassword(problem)}
        </p>
      )}
      <Button type="submit" disabled={pending} data-testid="invitation-submit">
        {pending ? t("working") : t("submit")}
      </Button>
    </form>
  );
}

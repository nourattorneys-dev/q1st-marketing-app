"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signInAction, type SignInState } from "@/app/[locale]/sign-in/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Spec M5c: email and password. A refusal shows here; the email stays in its field (React resets the form after an action). */
export function SignInForm({ locale }: { locale: string }) {
  const t = useTranslations("SignIn");
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, null);

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sign-in-email">{t("email")}</Label>
        <Input id="sign-in-email" name="email" type="email" dir="ltr" autoComplete="username" defaultValue={state?.email} data-testid="sign-in-email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sign-in-password">{t("password")}</Label>
        <Input id="sign-in-password" name="password" type="password" dir="ltr" autoComplete="current-password" data-testid="sign-in-password" />
      </div>
      {state?.error && (
        <p role="alert" data-testid="sign-in-error" data-reason={state.error} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <Button type="submit" disabled={pending} data-testid="sign-in-submit">
        {pending ? t("signingIn") : t("submit")}
      </Button>
    </form>
  );
}

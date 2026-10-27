"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A new password and its repetition, with the rule underneath (spec M5c: at least 10 characters). */
export function NewPasswordFields({ idPrefix, label }: { idPrefix: string; label: string }) {
  const t = useTranslations("Password");
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-password`}>{label}</Label>
        <Input
          id={`${idPrefix}-password`}
          name="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          aria-describedby={`${idPrefix}-hint`}
          data-testid={`${idPrefix}-password`}
        />
        <p id={`${idPrefix}-hint`} className="text-xs text-muted-foreground">
          {t("hint")}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-confirm`}>{t("confirm")}</Label>
        <Input id={`${idPrefix}-confirm`} name="confirm" type="password" dir="ltr" autoComplete="new-password" data-testid={`${idPrefix}-confirm`} />
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ActionFailure } from "@/components/actions/action-failure";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { draftLanguageOptions } from "@/lib/drafting/choices";
import type { EngineFailure } from "@/lib/engine/result";

type Props = {
  testId: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "secondary";
  triggerSize?: "default" | "sm";
  disabled?: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  languages: string[];
  pending: boolean;
  locale: string;
  canRequestUpgrade: boolean;
  onConfirm: (language: string) => Promise<EngineFailure | null>;
};

/** Draft with AI after choosing the language (spec v1.1 §6: en, ar or both). Closes only once the draft has started. */
export function DraftLanguageDialog(props: Props) {
  const { testId, triggerLabel, triggerVariant = "default", triggerSize = "default", disabled, title, description, confirmLabel } = props;
  const t = useTranslations("Drafting");
  const tLanguages = useTranslations("Review.languages");
  const options = draftLanguageOptions(props.languages);
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState(options[0] ?? "");
  const [error, setError] = useState<EngineFailure | null>(null);
  const label = (code: string) => (code === "both" ? t("both") : tLanguages.has(code) ? tLanguages(code) : code);

  async function confirm() {
    const failure = await props.onConfirm(language);
    setError(failure);
    if (!failure) setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} data-testid={testId} disabled={disabled}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t("language")}</legend>
          {options.map((code) => (
            <label key={code} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${testId}-language`}
                value={code}
                checked={language === code}
                onChange={() => setLanguage(code)}
                data-testid={`${testId}-language-${code}`}
                className="accent-primary"
              />
              {label(code)}
            </label>
          ))}
        </fieldset>
        {error && <ActionFailure error={error} locale={props.locale} canRequestUpgrade={props.canRequestUpgrade} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button data-testid={`${testId}-confirm`} disabled={props.pending || !language} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

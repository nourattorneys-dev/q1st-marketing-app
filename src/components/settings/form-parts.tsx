"use client";

import { useTranslations } from "next-intl";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import type { EngineFailure } from "@/lib/engine/result";

/** Spec v1.1 §9: the engine's message for one field, under that field. */
export function FieldMessage({ field, message }: { field: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p data-testid={`field-error-${field}`} className="text-xs text-bad-fg">
      {message}
    </p>
  );
}

/** Messages for fields this form doesn't show, so none is lost. */
export function OtherFieldErrors({ items }: { items: { field: string; message: string }[] }) {
  const t = useTranslations("Settings");
  if (items.length === 0) return null;
  return (
    <div data-testid="field-errors-other" className="text-sm text-bad-fg">
      <p>{t("otherFields")}</p>
      <ul className="list-disc ps-5">
        {items.map((item) => (
          <li key={item.field}>
            {item.field}: {item.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A failed save. Field errors point at the fields; a refused connection asks for a test; anything else is the usual action error. */
export function SaveFailure({ error }: { error: EngineFailure | null }) {
  const t = useTranslations("Settings");
  if (!error) return null;
  if (error.fields && Object.keys(error.fields).length > 0) {
    return (
      <p role="alert" data-testid="settings-check-fields" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
        {t("checkFields")}
      </p>
    );
  }
  if (error.code === "not_connected") {
    return (
      <p role="alert" data-testid="settings-test-first" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
        {t("testFirst")}
      </p>
    );
  }
  return <ActionError error={error} />;
}

type SaveBarProps = { onSave: () => void; pending: boolean; disabled: boolean; unsaved: boolean; savedNow: boolean };

export function SaveBar({ onSave, pending, disabled, unsaved, savedNow }: SaveBarProps) {
  const t = useTranslations("Settings");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button data-testid="settings-save" disabled={disabled || pending} onClick={onSave}>
        {pending ? t("saving") : t("save")}
      </Button>
      {unsaved && (
        <span data-testid="settings-unsaved" className="text-sm text-muted-foreground">
          {t("unsaved")}
        </span>
      )}
      {savedNow && !unsaved && (
        <span role="status" data-testid="settings-saved" className="text-sm text-ok-fg">
          {t("saved")}
        </span>
      )}
    </div>
  );
}

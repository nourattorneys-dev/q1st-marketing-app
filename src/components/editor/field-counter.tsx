"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  testId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  limit?: number;
  multiline?: boolean;
  dir?: "ltr" | "rtl";
  hint?: string;
  error?: string;
};

export function FieldCounter({ id, testId, label, value, onChange, disabled, limit, multiline, dir, hint, error }: Props) {
  const t = useTranslations("Editor");
  const over = limit !== undefined && value.length > limit;
  const errorId = `${id}-error`;
  const shared = { id, "data-testid": testId, value, dir, disabled, "aria-invalid": over || Boolean(error) || undefined, "aria-describedby": error ? errorId : undefined };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {limit !== undefined && (
          <span data-testid={`${testId}-count`} className={cn("text-xs", over ? "text-bad-fg" : "text-muted-foreground")}>
            {t("counter", { length: String(value.length), limit: String(limit) })}
          </span>
        )}
      </div>
      {multiline ? (
        <Textarea {...shared} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input {...shared} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <FieldError id={errorId} testId={`${testId}-error`} message={error} />}
    </div>
  );
}

/** A message from the engine about one field (spec v1.1 §9 invalid_input). */
export function FieldError({ id, testId, message }: { id?: string; testId: string; message: string }) {
  return (
    <p id={id} data-testid={testId} className="text-xs text-bad-fg">
      {message}
    </p>
  );
}

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
};

export function FieldCounter({ id, testId, label, value, onChange, disabled, limit, multiline, dir, hint }: Props) {
  const t = useTranslations("Editor");
  const over = limit !== undefined && value.length > limit;
  const shared = { id, "data-testid": testId, value, dir, disabled, "aria-invalid": over || undefined };
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
    </div>
  );
}

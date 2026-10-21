"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { EditableFields, FieldKey } from "@/lib/editor/changed-fields";

type Props = {
  fields: FieldKey[];
  mine: EditableFields;
  theirs: EditableFields;
  pending: boolean;
  onLoadTheirs: () => void;
  onKeepMine: () => void;
};

/** A readable value: text for the body, lists joined, the photo's alt and credit, a dash for empty. Shown only in the browser. */
function display(key: FieldKey, value: EditableFields[FieldKey]): string {
  if (value === null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  if (typeof value === "object") return [value.alt, value.credit].filter(Boolean).join(" · ") || "—";
  if (key !== "content") return value;
  const text = new DOMParser().parseFromString(value, "text/html").body.textContent ?? "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 240 ? `${flat.slice(0, 240)}…` : flat || "—";
}

/** Design §9: someone saved first. Both versions are shown; keeping mine saves my changed fields on top of theirs. */
export function ConflictPanel({ fields, mine, theirs, pending, onLoadTheirs, onKeepMine }: Props) {
  const t = useTranslations("Editor");
  return (
    <div role="alert" data-testid="conflict-panel" className="rounded-md border border-warn-fg/40 bg-warn-bg p-4 text-sm text-warn-fg">
      <p className="font-medium">{t("conflictTitle")}</p>
      <p className="mt-1">{t("conflictBody")}</p>
      <dl className="mt-2 flex flex-col gap-2">
        {fields.map((field) => (
          <div key={field}>
            <dt className="font-medium">{t(`fields.${field}`)}</dt>
            <dd className="ps-3">
              {t("conflictTheirs")}: <span dir="auto">{display(field, theirs[field])}</span>
            </dd>
            <dd className="ps-3">
              {t("conflictMine")}: <span dir="auto">{display(field, mine[field])}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" data-testid="conflict-load-theirs" onClick={onLoadTheirs}>
          {t("loadTheirs")}
        </Button>
        <Button size="sm" data-testid="conflict-keep-mine" disabled={pending} onClick={onKeepMine}>
          {t("keepMine")}
        </Button>
      </div>
    </div>
  );
}

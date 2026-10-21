"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { FieldKey } from "@/lib/editor/changed-fields";

type Props = { fields: FieldKey[]; pending: boolean; onLoadTheirs: () => void; onKeepMine: () => void };

export function ConflictPanel({ fields, pending, onLoadTheirs, onKeepMine }: Props) {
  const t = useTranslations("Editor");
  return (
    <div role="alert" data-testid="conflict-panel" className="rounded-md border border-warn-fg/40 bg-warn-bg p-4 text-sm text-warn-fg">
      <p className="font-medium">{t("conflictTitle")}</p>
      <p className="mt-1">{t("conflictBody")}</p>
      <ul className="mt-2 list-disc ps-5">
        {fields.map((field) => (
          <li key={field}>{t(`fields.${field}`)}</li>
        ))}
      </ul>
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

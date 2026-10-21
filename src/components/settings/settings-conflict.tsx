"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type Row = { key: string; label: string; theirs: unknown; mine: unknown };
type Props = { rows: Row[]; pending: boolean; onLoadTheirs: () => void; onKeepMine: () => void };

/** Design §9: someone saved first. Both versions are shown; keeping mine saves my changed fields on top of theirs. */
export function SettingsConflict({ rows, pending, onLoadTheirs, onKeepMine }: Props) {
  const t = useTranslations("Settings");
  const show = (value: unknown): string => {
    if (typeof value === "boolean") return value ? t("on") : t("off");
    if (Array.isArray(value)) return value.join(", ");
    if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`).join(", ");
    return value === null || value === undefined ? "" : String(value);
  };
  return (
    <div role="alert" data-testid="settings-conflict" className="rounded-md border border-warn-fg/40 bg-warn-bg p-4 text-sm text-warn-fg">
      <p className="font-medium">{t("conflict.title")}</p>
      <p className="mt-1">{t("conflict.body")}</p>
      <dl className="mt-2 flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.key} data-testid={`settings-conflict-${row.key}`}>
            <dt className="font-medium">{row.label}</dt>
            <dd className="ps-3">
              {t("conflict.theirs")}: <span dir="auto">{show(row.theirs) || "—"}</span>
            </dd>
            <dd className="ps-3">
              {t("conflict.mine")}: <span dir="auto">{show(row.mine) || "—"}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" data-testid="settings-conflict-load-theirs" onClick={onLoadTheirs}>
          {t("conflict.loadTheirs")}
        </Button>
        <Button size="sm" data-testid="settings-conflict-keep-mine" disabled={pending} onClick={onKeepMine}>
          {t("conflict.keepMine")}
        </Button>
      </div>
    </div>
  );
}

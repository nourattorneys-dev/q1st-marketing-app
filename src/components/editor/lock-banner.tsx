"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function LockBanner({ name, pending, onTakeover }: { name: string; pending: boolean; onTakeover: () => void }) {
  const t = useTranslations("Editor");
  return (
    <div role="status" data-testid="lock-banner" className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-warn-bg px-4 py-3 text-sm text-warn-fg">
      <span>{t("lockedBy", { name })}</span>
      <Button size="sm" variant="outline" data-testid="takeover" disabled={pending} onClick={onTakeover}>
        {t("takeover")}
      </Button>
    </div>
  );
}

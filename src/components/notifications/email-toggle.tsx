"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { setEmailNotificationsAction } from "@/app/[locale]/(app)/notifications/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";

export function EmailToggle({ locale, enabled }: { locale: string; enabled: boolean }) {
  const t = useTranslations("Notifications");
  const toggle = useEngineAction(setEmailNotificationsAction);
  const [error, setError] = useState<EngineFailure | null>(null);

  async function flip() {
    setError(null);
    const result = await toggle.run({ locale, enabled: !enabled });
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="flex flex-col gap-2">
      <p data-testid="email-status" data-enabled={String(enabled)} className={enabled ? "text-ok-fg" : "text-muted-foreground"}>
        {enabled ? t("on") : t("off")}
      </p>
      <div>
        <Button variant="outline" data-testid="email-toggle" disabled={toggle.pending} onClick={() => void flip()}>
          {enabled ? t("turnOff") : t("turnOn")}
        </Button>
      </div>
      {error && <ActionError error={error} />}
    </div>
  );
}

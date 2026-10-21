"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { setUpWebhookAction } from "@/app/[locale]/(app)/settings/webhook/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { WebhookStatus } from "@/lib/webhooks/status";

type Props = { locale: string; status: WebhookStatus; ourUrl: string | null; registeredUrl: string | null; lastEvent: string | null; canStore: boolean };

/** Set up (or move here, or re-key) the one webhook this deployment receives (spec v1.1 §8). */
export function WebhookBoard({ locale, status, ourUrl, registeredUrl, lastEvent, canStore }: Props) {
  const t = useTranslations("Settings.webhook");
  const setUp = useEngineAction(setUpWebhookAction);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);
  const notConfigured = !canStore || error?.code === "not_configured";

  async function run() {
    setError(null);
    setDone(false);
    const result = await setUp.run({ locale });
    if (result.ok) setDone(true);
    else setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t("address")}</p>
          <p data-testid="webhook-url">
            <bdi>{ourUrl ?? t("noAddress")}</bdi>
          </p>
        </div>
        <p data-testid="webhook-status" data-status={status} className={status === "connected" ? "text-ok-fg" : "text-warn-fg"}>
          {t(`status.${status}`, { url: registeredUrl ?? "" })}
        </p>
        <p data-testid="webhook-last-event">{lastEvent ? t("lastEvent", { time: lastEvent }) : t("noEvents")}</p>
        {notConfigured && (
          <p role="alert" data-testid="webhook-not-configured" className="rounded-md bg-bad-bg px-3 py-2 text-bad-fg">
            {t("notConfigured")}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <div>
            <Button data-testid="webhook-set-up" disabled={notConfigured || !ourUrl || setUp.pending} onClick={() => void run()}>
              {t(`setUp.${status}`)}
            </Button>
          </div>
          {status === "connected" && <p className="text-xs text-muted-foreground">{t("rotateHint")}</p>}
        </div>
        {done && (
          <p role="status" data-testid="webhook-done" className="text-ok-fg">
            {t("done")}
          </p>
        )}
        {error && error.code !== "not_configured" && <ActionError error={error} />}
      </CardContent>
    </Card>
  );
}

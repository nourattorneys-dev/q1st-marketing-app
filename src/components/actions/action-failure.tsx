"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { requestUpgradeAction } from "@/app/[locale]/(app)/plan/actions";
import { Button } from "@/components/ui/button";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import { ActionError } from "./action-error";

type Props = { error: EngineFailure; locale: string; canRequestUpgrade: boolean };

/** An action's error; a 429 quota_exceeded shows the limit and the next step for this role (design §9). */
export function ActionFailure({ error, locale, canRequestUpgrade }: Props) {
  if (error.code !== "quota_exceeded") return <ActionError error={error} />;
  return <QuotaExceeded error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />;
}

function QuotaExceeded({ error, locale, canRequestUpgrade }: Props) {
  const t = useTranslations("Quota");
  const tMetrics = useTranslations("Dashboard.quota.metrics");
  const upgrade = useEngineAction(requestUpgradeAction);
  const [requested, setRequested] = useState(false);
  const [failure, setFailure] = useState<EngineFailure | null>(null);
  const metric = String(error.details?.metric ?? "");
  const label = metric && tMetrics.has(metric) ? tMetrics(metric) : metric;

  async function request() {
    setFailure(null);
    const result = await upgrade.run({ locale, metric: metric || undefined });
    if (result.ok) setRequested(true);
    else setFailure(result.error);
  }

  return (
    <div role="alert" data-testid="quota-exceeded" className="flex flex-col gap-2 rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
      <p>{t("limitReached", { metric: label })}</p>
      {!canRequestUpgrade && <p data-testid="ask-admin">{t("askAdmin")}</p>}
      {canRequestUpgrade && !requested && (
        <div>
          <Button size="sm" data-testid="request-upgrade" disabled={upgrade.pending} onClick={() => void request()}>
            {t("request")}
          </Button>
        </div>
      )}
      {requested && <p data-testid="upgrade-requested">{t("requested")}</p>}
      {failure && <ActionError error={failure} />}
    </div>
  );
}

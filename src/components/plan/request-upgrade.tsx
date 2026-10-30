"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { requestUpgradeAction } from "@/app/[locale]/(app)/plan/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import { metricLabel, type MetricNames } from "@/lib/plan/metric-label";

const SELECT = "h-9 rounded-md border border-input bg-card px-3 text-sm";

/** Spec v1.1 §6 Plan & usage "Request upgrade": an optional limit and note; Quantum1st answers outside the portal. */
export function RequestUpgrade({ locale, metrics, names }: { locale: string; metrics: string[]; names: MetricNames }) {
  const t = useTranslations("Plan.upgrade");
  const tMetrics = useTranslations("Dashboard.quota.metrics");
  const request = useEngineAction(requestUpgradeAction);
  const [metric, setMetric] = useState("");
  const [note, setNote] = useState("");
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);

  async function submit() {
    setError(null);
    const result = await request.run({ locale, metric: metric || undefined, note: note.trim() || undefined });
    if (result.ok) setRequested(true);
    else setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {requested ? (
          <p role="status" data-testid="plan-upgrade-requested" className="text-sm text-ok-fg">
            {t("requested")}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="upgrade-metric">{t("metric")}</Label>
              <select id="upgrade-metric" data-testid="upgrade-metric" className={SELECT} value={metric} onChange={(event) => setMetric(event.target.value)}>
                <option value="">{t("anyMetric")}</option>
                {metrics.map((code) => (
                  <option key={code} value={code}>
                    {metricLabel(code, names, { has: (key) => tMetrics.has(key), get: (key) => tMetrics(key as never) })}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="upgrade-note">{t("note")}</Label>
              <Textarea id="upgrade-note" data-testid="upgrade-note" dir="auto" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
            <div>
              <Button data-testid="plan-request-upgrade" disabled={request.pending} onClick={() => void submit()}>
                {t("submit")}
              </Button>
            </div>
          </>
        )}
        {error && <ActionError error={error} />}
      </CardContent>
    </Card>
  );
}

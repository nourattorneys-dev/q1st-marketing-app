"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { findingsAction, prepareFixesAction, scanSiteAction } from "@/app/[locale]/(app)/site-health/actions";
import { ActionFailure } from "@/components/actions/action-failure";
import { ConfirmDialog } from "@/components/editor/confirm-dialog";
import { JobTracker } from "@/components/jobs/job-tracker";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { SiteFinding } from "@/lib/engine/schemas";
import { findingActions } from "@/lib/site-health/findings";
import { cn } from "@/lib/utils";

type Props = { locale: string; findings: SiteFinding[]; pollSeconds: number; canApply: boolean; canRequestUpgrade: boolean };

const LEVEL_TONE: Record<string, string> = { critical: "bg-bad-bg text-bad-fg", warn: "bg-warn-bg text-warn-fg", info: "bg-info-bg text-info-fg" };

/** Spec v1.1 §6 /site-health: Scan site and Prepare fixes for selected (jobs), and a findings table with Apply and Dismiss. */
export function FindingsBoard({ locale, findings, pollSeconds, canApply, canRequestUpgrade }: Props) {
  const t = useTranslations("SiteHealth");
  const router = useRouter();
  const scan = useEngineAction(scanSiteAction);
  const prepare = useEngineAction(prepareFixesAction);
  const act = useEngineAction(findingsAction);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanJob, setScanJob] = useState<string | null>(null);
  const [prepareJob, setPrepareJob] = useState<string | null>(null);
  // A running scan or fix job keeps its button off: each scan is metered (siteScans), so a second click mustn't start another.
  const [scanning, setScanning] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const refresh = useCallback(() => router.refresh(), [router]);
  const chosen = [...selected].filter((id) => findings.some((finding) => finding.id === id && findingActions(finding, canApply).select));
  const label = (group: "levels" | "statuses", code: string) => (t.has(`${group}.${code}`) ? t(`${group}.${code}`) : code);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function startScan() {
    setError(null);
    const result = await scan.run({ locale });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setScanJob(result.data.jobId);
    setScanning(true);
  }

  async function startPrepare() {
    setError(null);
    const result = await prepare.run({ locale, ids: chosen });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPrepareJob(result.data.jobId);
    setPreparing(true);
    setSelected(new Set());
  }

  /** One finding through the bulk endpoint; a refusal names the page it's about (spec v1.1 §3 bulk result). */
  async function run(action: "apply" | "dismiss", finding: SiteFinding): Promise<EngineFailure | null> {
    setFailures([]);
    const result = await act.run({ locale, action, ids: [finding.id] });
    if (!result.ok) return result.error;
    setFailures(result.data.failed.map((failure) => `${finding.url}: ${failure.message}`));
    return null;
  }

  async function dismiss(finding: SiteFinding) {
    setError(null);
    const failure = await run("dismiss", finding);
    if (failure) setError(failure);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button data-testid="site-scan" disabled={scan.pending || scanning} onClick={() => void startScan()}>
          {t("scan")}
        </Button>
        <Button variant="outline" data-testid="prepare-fixes" disabled={chosen.length === 0 || prepare.pending || preparing} onClick={() => void startPrepare()}>
          {t("prepare", { count: String(chosen.length) })}
        </Button>
      </div>
      {scanJob && <JobTracker key={scanJob} jobId={scanJob} pollSeconds={pollSeconds} label={t("scanning")} testId="scan-job" onDone={refresh} onSettled={() => setScanning(false)} />}
      {prepareJob && <JobTracker key={prepareJob} jobId={prepareJob} pollSeconds={pollSeconds} label={t("preparing")} testId="prepare-job" onDone={refresh} onSettled={() => setPreparing(false)} />}
      {error && <ActionFailure error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />}
      {failures.length > 0 && (
        <div role="alert" data-testid="finding-failures" className="rounded-md bg-bad-bg p-3 text-sm text-bad-fg">
          <p className="font-medium">{t("failed")}</p>
          <ul className="mt-1 list-disc ps-5">
            {failures.map((line) => (
              <li key={line} dir="auto">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
      {findings.length === 0 ? (
        <p data-testid="findings-empty" className="text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table data-testid="findings" className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-8 p-2">
                  <span className="sr-only">{t("columns.select")}</span>
                </th>
                <th className="p-2 text-start font-medium">{t("columns.url")}</th>
                <th className="p-2 text-start font-medium">{t("columns.level")}</th>
                <th className="p-2 text-start font-medium">{t("columns.issue")}</th>
                <th className="p-2 text-start font-medium">{t("columns.fix")}</th>
                <th className="p-2 text-start font-medium">{t("columns.status")}</th>
                <th className="p-2">
                  <span className="sr-only">{t("columns.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => {
                const allowed = findingActions(finding, canApply);
                return (
                  <tr key={finding.id} data-testid={`finding-${finding.id}`} className="border-b border-border align-top last:border-0">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        data-testid={`finding-select-${finding.id}`}
                        aria-label={t("select", { url: finding.url })}
                        disabled={!allowed.select}
                        checked={selected.has(finding.id)}
                        onChange={(event) => toggle(finding.id, event.target.checked)}
                      />
                    </td>
                    <td className="p-2">
                      <a href={finding.url} target="_blank" rel="noreferrer" dir="ltr" className="break-all text-primary underline">
                        {finding.url}
                      </a>
                    </td>
                    <td className="p-2">
                      <span data-testid={`finding-level-${finding.id}`} className={cn("rounded px-2 py-0.5 text-xs", LEVEL_TONE[finding.level] ?? "bg-muted")}>
                        {label("levels", finding.level)}
                      </span>
                    </td>
                    <td className="p-2" dir="auto" data-testid={`finding-issue-${finding.id}`}>
                      {finding.issue}
                    </td>
                    <td className="p-2" dir="auto" data-testid={`finding-fix-${finding.id}`}>
                      {finding.fix ?? "—"}
                    </td>
                    <td className="p-2" data-testid={`finding-status-${finding.id}`}>
                      {label("statuses", finding.status)}
                    </td>
                    <td className="p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {allowed.apply && (
                          <ConfirmDialog
                            testId={`finding-apply-${finding.id}`}
                            triggerVariant="default"
                            triggerLabel={t("apply")}
                            title={t("applyTitle")}
                            description={t("applyBody", { url: finding.url })}
                            confirmLabel={t("apply")}
                            pending={act.pending}
                            onConfirm={() => run("apply", finding)}
                          />
                        )}
                        {allowed.dismiss && (
                          <Button size="sm" variant="outline" data-testid={`finding-dismiss-${finding.id}`} disabled={act.pending} onClick={() => void dismiss(finding)}>
                            {t("dismiss")}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

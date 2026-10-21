"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { jobAction } from "@/app/[locale]/(app)/review/actions";

type Props = { locale: string; jobId: string; pollSeconds: number; onDone: () => void };

/** Polls GET /jobs/{id} at the engine's interval until the job is done or failed (spec v1.1 §3 async jobs). */
export function JobProgress({ locale, jobId, pollSeconds, onDone }: Props) {
  const t = useTranslations("Editor");
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setInterval(() => void poll(), pollSeconds * 1000);
    async function poll() {
      const result = await jobAction({ locale, jobId });
      if (!active) return;
      if (!result.ok) {
        setFailure(result.error.message);
        return;
      }
      setProgress(result.data.progress ?? 0);
      if (result.data.status === "done") {
        active = false;
        clearInterval(timer);
        onDone();
      } else if (result.data.status === "failed") {
        active = false;
        clearInterval(timer);
        setFailure(typeof result.data.error === "string" ? result.data.error : t("jobFailed"));
      }
    }
    void poll();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jobId, locale, onDone, pollSeconds, t]);

  return (
    <div role="status" data-testid="job-progress" className="flex flex-col gap-1 text-sm">
      <span>{t("redrafting", { percent: String(Math.round(progress * 100)) })}</span>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {failure && <p className="text-bad-fg">{failure}</p>}
    </div>
  );
}

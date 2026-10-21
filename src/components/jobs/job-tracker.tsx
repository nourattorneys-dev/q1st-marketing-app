"use client";

import { useTranslations } from "next-intl";
import { useJob } from "./use-job";

const MESSAGE_KEYS = new Set(["unreachable", "signedOut", "jobFailed"]);

type Props = { jobId: string; pollSeconds: number; label: string; testId?: string; onDone?: (result: unknown) => void };

/** A slow AI job's progress (design §8). It stops with a message if the job fails or can't be followed any more. */
export function JobTracker({ jobId, pollSeconds, label, testId = "job-tracker", onDone }: Props) {
  const t = useTranslations("Jobs");
  const state = useJob(jobId, pollSeconds, onDone);
  const percent = Math.round(state.progress * 100);
  const message = state.message && (MESSAGE_KEYS.has(state.message) ? t(state.message) : state.message);
  return (
    <div role="status" data-testid={testId} data-state={state.status} className="flex flex-col gap-1 text-sm">
      <span>{state.status === "done" ? t("done") : `${label} ${t("percent", { percent: String(percent) })}`}</span>
      {state.status === "running" && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}
      {message && <p className={state.status === "failed" ? "text-bad-fg" : "text-muted-foreground"}>{message}</p>}
    </div>
  );
}

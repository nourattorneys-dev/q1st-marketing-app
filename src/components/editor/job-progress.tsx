"use client";

import { useTranslations } from "next-intl";
import { JobTracker } from "@/components/jobs/job-tracker";

type Props = { jobId: string; pollSeconds: number; onDone: () => void };

/** The redraft after "Ask for changes", followed through our /api/jobs route (design §8). */
export function JobProgress({ jobId, pollSeconds, onDone }: Props) {
  const t = useTranslations("Editor");
  return <JobTracker jobId={jobId} pollSeconds={pollSeconds} label={t("redraftingLabel")} testId="job-progress" onDone={onDone} />;
}

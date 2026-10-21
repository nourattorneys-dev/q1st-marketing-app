"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { proposeKeywordsAction } from "@/app/[locale]/(app)/keywords/actions";
import { ActionFailure } from "@/components/actions/action-failure";
import { JobTracker } from "@/components/jobs/job-tracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";

/** Spec v1.1 §6 "Propose keywords (AI): starts a job". The new keywords land in the New tab. */
export function ProposeKeywords({ locale, languages, pollSeconds, canRequestUpgrade }: { locale: string; languages: string[]; pollSeconds: number; canRequestUpgrade: boolean }) {
  const t = useTranslations("Keywords.propose");
  const tLanguages = useTranslations("Review.languages");
  const router = useRouter();
  const propose = useEngineAction(proposeKeywordsAction);
  const [language, setLanguage] = useState(""); // "" means all the site's languages
  const [jobId, setJobId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);
  const finished = useCallback(() => {
    setReady(true);
    router.refresh();
  }, [router]);

  async function start() {
    setError(null);
    setReady(false);
    const result = await propose.run({ locale, language: language || undefined });
    if (result.ok) setJobId(result.data.jobId);
    else setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <select
            data-testid="propose-language"
            aria-label={t("language")}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="">{t("all")}</option>
            {languages.map((code) => (
              <option key={code} value={code}>
                {tLanguages.has(code) ? tLanguages(code) : code}
              </option>
            ))}
          </select>
          <Button data-testid="propose-keywords" disabled={propose.pending} onClick={() => void start()}>
            {t("submit")}
          </Button>
        </div>
        {jobId && <JobTracker key={jobId} jobId={jobId} pollSeconds={pollSeconds} label={t("running")} testId="propose-job" onDone={finished} />}
        {ready && (
          <p data-testid="proposals-ready" className="text-sm">
            {t("ready")}
          </p>
        )}
        {error && <ActionFailure error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />}
      </CardContent>
    </Card>
  );
}

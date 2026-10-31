"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { createDraftsAction } from "@/app/[locale]/(app)/ideas/actions";
import { ActionFailure } from "@/components/actions/action-failure";
import { JobTracker } from "@/components/jobs/job-tracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import { draftLanguageOptions, platformsFor } from "@/lib/drafting/choices";
import type { EngineFailure } from "@/lib/engine/result";
import { parsePhrases } from "@/lib/keywords/phrases";

type Props = { locale: string; kinds: string[]; platforms: string[]; languages: string[]; pollSeconds: number; canRequestUpgrade: boolean };

const SELECT = "h-9 rounded-md border border-input bg-card px-3 text-sm";

/** Spec v1.1 §6 "New request": topic, type, platform, language (en, ar or both), tone and optional keywords → POST …/drafts. */
export function NewRequestForm({ locale, kinds, platforms, languages, pollSeconds, canRequestUpgrade }: Props) {
  const t = useTranslations("Ideas.request");
  const tReview = useTranslations("Review");
  const tDrafting = useTranslations("Drafting");
  const router = useRouter();
  const create = useEngineAction(createDraftsAction);
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState(kinds[0] ?? "");
  const [platform, setPlatform] = useState("");
  const [language, setLanguage] = useState(draftLanguageOptions(languages)[0] ?? "");
  const [tone, setTone] = useState("");
  const [keywords, setKeywords] = useState("");
  const [started, setStarted] = useState<{ jobId: string; count: number } | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const refresh = useCallback(() => router.refresh(), [router]);
  const platformChoices = platformsFor(kind, platforms);
  const chosenPlatform = platformChoices.includes(platform) ? platform : (platformChoices[0] ?? "");
  // An article is always every site language; a social post can be one.
  const languageChoices = draftLanguageOptions(languages, kind);
  const chosenLanguage = languageChoices.includes(language) ? language : (languageChoices[0] ?? "");
  const label = (group: "kinds" | "platforms" | "languages", code: string) => (tReview.has(`${group}.${code}`) ? tReview(`${group}.${code}`) : code);

  async function submit() {
    setError(null);
    const phrases = parsePhrases(keywords);
    const request = {
      topic: topic.trim(),
      kind,
      platform: chosenPlatform,
      language: chosenLanguage,
      ...(tone.trim() ? { tone: tone.trim() } : {}),
      ...(phrases.length > 0 ? { keywords: phrases } : {}),
    };
    const result = await create.run({ locale, request });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStarted({ jobId: result.data.jobId, count: result.data.postIds.length });
    setTopic("");
    setTone("");
    setKeywords("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="request-topic">{t("topic")}</Label>
          <Input id="request-topic" data-testid="request-topic" dir="auto" value={topic} onChange={(event) => setTopic(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-kind">{t("kind")}</Label>
            <select id="request-kind" data-testid="request-kind" className={SELECT} value={kind} onChange={(event) => setKind(event.target.value)}>
              {kinds.map((code) => (
                <option key={code} value={code}>
                  {label("kinds", code)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-platform">{t("platform")}</Label>
            <select id="request-platform" data-testid="request-platform" className={SELECT} value={chosenPlatform} onChange={(event) => setPlatform(event.target.value)}>
              {platformChoices.map((code) => (
                <option key={code} value={code}>
                  {label("platforms", code)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-language">{t("language")}</Label>
            <select id="request-language" data-testid="request-language" className={SELECT} value={chosenLanguage} onChange={(event) => setLanguage(event.target.value)}>
              {languageChoices.map((code) => (
                <option key={code} value={code}>
                  {code === "both" ? tDrafting("both") : label("languages", code)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="request-tone">{t("tone")}</Label>
          <Input id="request-tone" data-testid="request-tone" value={tone} onChange={(event) => setTone(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="request-keywords">{t("keywords")}</Label>
          <Input id="request-keywords" data-testid="request-keywords" dir="auto" value={keywords} onChange={(event) => setKeywords(event.target.value)} />
          <p className="text-xs text-muted-foreground">{t("keywordsHint")}</p>
        </div>
        <div>
          <Button data-testid="request-submit" disabled={!topic.trim() || !chosenPlatform || create.pending} onClick={() => void submit()}>
            {t("submit")}
          </Button>
        </div>
        {error && <ActionFailure error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />}
        {error?.fields && (
          <ul className="list-disc ps-5 text-sm text-bad-fg">
            {Object.entries(error.fields).map(([field, message]) => (
              <li key={field} data-testid={`request-error-${field}`}>
                {t.has(field) ? t(field) : field}: {message}
              </li>
            ))}
          </ul>
        )}
        {started && (
          <div className="flex flex-col gap-2">
            <p data-testid="request-started" className="text-sm">
              {t("started", { count: started.count, n: String(started.count) })}{" "}
              <Link href="/review" className="text-primary underline">
                {t("openReview")}
              </Link>
            </p>
            <JobTracker key={started.jobId} jobId={started.jobId} pollSeconds={pollSeconds} label={t("running")} testId="request-job" onDone={refresh} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { bulkKeywordsAction, draftKeywordArticlesAction, keywordTopicsAction } from "@/app/[locale]/(app)/keywords/actions";
import { ActionFailure } from "@/components/actions/action-failure";
import { DraftLanguageDialog } from "@/components/drafting/draft-language-dialog";
import { JobTracker } from "@/components/jobs/job-tracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { KeywordBulkAction } from "@/lib/engine/api";
import type { EngineFailure } from "@/lib/engine/result";
import { tabActions, type KeywordTab } from "@/lib/keywords/tabs";
import { bulkFailureLines } from "@/lib/review/summary";

export type KeywordRow = { id: string; phrase: string; language: string; source: string; status: string; rationale: string | null; uses: number };

type Props = { locale: string; tab: KeywordTab; keywords: KeywordRow[]; languages: string[]; pollSeconds: number; canRequestUpgrade: boolean };

/** Spec v1.1 §6 /keywords: a table per tab; approve, dismiss, restore, propose topics and draft articles for the selected keywords. */
export function KeywordsBoard({ locale, tab, keywords, languages, pollSeconds, canRequestUpgrade }: Props) {
  const t = useTranslations("Keywords");
  const tLanguages = useTranslations("Review.languages");
  const router = useRouter();
  const bulk = useEngineAction(bulkKeywordsAction);
  const topics = useEngineAction(keywordTopicsAction);
  const draft = useEngineAction(draftKeywordArticlesAction);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<{ id: string; title: string; message: string }[]>([]);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [topicsJob, setTopicsJob] = useState<string | null>(null);
  const [topicsReady, setTopicsReady] = useState(false);
  const [draftJob, setDraftJob] = useState<{ jobId: string; count: number } | null>(null);
  const actions = tabActions(tab);
  const chosen = [...selected].filter((id) => keywords.some((keyword) => keyword.id === id));
  const languageLabel = (code: string) => (tLanguages.has(code) ? tLanguages(code) : code);
  const sourceLabel = (source: string) => (t.has(`sources.${source}`) ? t(`sources.${source}`) : source);
  const refresh = useCallback(() => router.refresh(), [router]);
  const showTopicsReady = useCallback(() => setTopicsReady(true), []);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function move(action: KeywordBulkAction) {
    setError(null);
    const result = await bulk.run({ locale, action, ids: chosen });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFailures(bulkFailureLines(result.data, keywords.map((keyword) => ({ id: keyword.id, title: keyword.phrase }))));
    setSelected(new Set(result.data.failed.map((failure) => failure.id)));
  }

  async function proposeTopics() {
    setError(null);
    setTopicsReady(false);
    const result = await topics.run({ locale, ids: chosen });
    if (result.ok) setTopicsJob(result.data.jobId);
    else setError(result.error);
  }

  async function draftArticles(language: string): Promise<EngineFailure | null> {
    const result = await draft.run({ locale, ids: chosen, language });
    if (!result.ok) return result.error;
    setDraftJob({ jobId: result.data.jobId, count: result.data.postIds.length });
    setSelected(new Set());
    return null;
  }

  const none = chosen.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {actions.approve && (
          <Button size="sm" data-testid="keywords-approve" disabled={none || bulk.pending} onClick={() => void move("approve")}>
            {t("approve")}
          </Button>
        )}
        {actions.dismiss && (
          <Button size="sm" variant="outline" data-testid="keywords-dismiss" disabled={none || bulk.pending} onClick={() => void move("dismiss")}>
            {t("dismiss")}
          </Button>
        )}
        {actions.restore && (
          <Button size="sm" data-testid="keywords-restore" disabled={none || bulk.pending} onClick={() => void move("restore")}>
            {t("restore")}
          </Button>
        )}
        {actions.topics && (
          <Button size="sm" variant="outline" data-testid="keywords-topics" disabled={none || topics.pending} onClick={() => void proposeTopics()}>
            {t("topics")}
          </Button>
        )}
        {actions.draft && (
          <DraftLanguageDialog
            testId="keywords-draft"
            triggerLabel={t("draft")}
            triggerVariant="secondary"
            triggerSize="sm"
            disabled={none}
            title={t("draftTitle")}
            description={t("draftBody")}
            confirmLabel={t("draftConfirm")}
            languages={languages}
            pending={draft.pending}
            locale={locale}
            canRequestUpgrade={canRequestUpgrade}
            onConfirm={draftArticles}
          />
        )}
      </div>
      {error && <ActionFailure error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />}
      {failures.length > 0 && (
        <div role="alert" data-testid="bulk-failures" className="rounded-md bg-bad-bg p-3 text-sm text-bad-fg">
          <p className="font-medium">{t("bulkFailed")}</p>
          <ul className="mt-1 list-disc ps-5">
            {failures.map((failure) => (
              <li key={failure.id}>
                <span dir="auto">{failure.title}</span>: {failure.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {topicsJob && <JobTracker key={topicsJob} jobId={topicsJob} pollSeconds={pollSeconds} label={t("proposingTopics")} testId="topics-job" onDone={showTopicsReady} />}
      {topicsReady && (
        <p data-testid="topics-ready" className="text-sm">
          {t("topicsReady")}{" "}
          <Link href="/ideas" data-testid="open-ideas" className="text-primary underline">
            {t("openIdeas")}
          </Link>
        </p>
      )}
      {draftJob && (
        <div className="flex flex-col gap-2">
          <p data-testid="drafts-started" className="text-sm">
            {t("draftsStarted", { count: draftJob.count, n: String(draftJob.count) })}{" "}
            <Link href="/review" className="text-primary underline">
              {t("openReview")}
            </Link>
          </p>
          <JobTracker key={draftJob.jobId} jobId={draftJob.jobId} pollSeconds={pollSeconds} label={t("drafting")} testId="draft-job" onDone={refresh} />
        </div>
      )}
      {keywords.length === 0 ? (
        <p data-testid="keywords-empty" className="text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="w-8 p-2" />
                <th className="p-2 text-start font-medium">{t("columns.phrase")}</th>
                <th className="p-2 text-start font-medium">{t("columns.language")}</th>
                <th className="p-2 text-start font-medium">{t("columns.source")}</th>
                <th className="p-2 text-start font-medium">{t("columns.rationale")}</th>
                <th className="p-2 text-end font-medium">{t("columns.uses")}</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((keyword) => (
                <tr key={keyword.id} data-testid={`keyword-row-${keyword.id}`} className="border-b border-border">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      data-testid={`keyword-select-${keyword.id}`}
                      aria-label={t("select", { phrase: keyword.phrase })}
                      checked={selected.has(keyword.id)}
                      onChange={(event) => toggle(keyword.id, event.target.checked)}
                    />
                  </td>
                  <td className="p-2">
                    <span data-testid={`keyword-phrase-${keyword.id}`} lang={keyword.language} dir={keyword.language === "ar" ? "rtl" : "ltr"} className="font-medium">
                      {keyword.phrase}
                    </span>
                    {keyword.status === "off_strategy" && (
                      <Badge variant="outline" className="ms-2" data-testid={`keyword-off-strategy-${keyword.id}`}>
                        {t("offStrategy")}
                      </Badge>
                    )}
                  </td>
                  <td className="p-2">{languageLabel(keyword.language)}</td>
                  <td className="p-2">{sourceLabel(keyword.source)}</td>
                  <td className="p-2 text-muted-foreground">{keyword.rationale ?? "—"}</td>
                  <td className="p-2 text-end">{keyword.uses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

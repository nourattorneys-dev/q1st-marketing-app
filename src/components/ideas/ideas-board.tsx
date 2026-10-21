"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { bulkSuggestionsAction } from "@/app/[locale]/(app)/ideas/actions";
import { ActionFailure } from "@/components/actions/action-failure";
import { DraftLanguageDialog } from "@/components/drafting/draft-language-dialog";
import { AutoRefresh } from "@/components/review/auto-refresh";
import { Button } from "@/components/ui/button";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { SuggestionBulkAction } from "@/lib/engine/api";
import type { EngineFailure } from "@/lib/engine/result";
import type { Suggestion } from "@/lib/engine/schemas";
import { bulkFailureLines } from "@/lib/review/summary";
import { SuggestionCard } from "./suggestion-card";

type Props = { locale: string; ideas: Suggestion[]; languages: string[]; pollSeconds: number; canRequestUpgrade: boolean };

/** Spec v1.1 §6 /suggestions: topic cards; Draft (en, ar or both) or Dismiss, one by one or in bulk. */
export function IdeasBoard({ locale, ideas, languages, pollSeconds, canRequestUpgrade }: Props) {
  const t = useTranslations("Ideas");
  const bulk = useEngineAction(bulkSuggestionsAction);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<{ id: string; title: string; message: string }[]>([]);
  const [error, setError] = useState<EngineFailure | null>(null);
  const chosen = [...selected].filter((id) => ideas.some((idea) => idea.id === id && idea.status === "new"));

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runBulk(action: SuggestionBulkAction, language?: string): Promise<EngineFailure | null> {
    setError(null);
    const result = await bulk.run({ locale, action, ids: chosen, language });
    if (!result.ok) return result.error;
    setFailures(bulkFailureLines(result.data, ideas));
    setSelected(new Set(result.data.failed.map((failure) => failure.id)));
    return null;
  }

  async function dismissSelected() {
    const failure = await runBulk("dismiss");
    if (failure) setError(failure);
  }

  if (ideas.length === 0) {
    return (
      <p data-testid="ideas-empty" className="text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {ideas.some((idea) => idea.status === "drafting") && <AutoRefresh seconds={pollSeconds} />}
      <div className="flex flex-wrap items-center gap-2">
        <DraftLanguageDialog
          testId="ideas-draft-selected"
          triggerLabel={t("draftSelected", { count: String(chosen.length) })}
          triggerSize="sm"
          disabled={chosen.length === 0}
          title={t("draftTitle")}
          description={t("draftBody")}
          confirmLabel={t("draftConfirm")}
          languages={languages}
          pending={bulk.pending}
          locale={locale}
          canRequestUpgrade={canRequestUpgrade}
          onConfirm={(language) => runBulk("draft", language)}
        />
        <Button size="sm" variant="outline" data-testid="ideas-dismiss-selected" disabled={chosen.length === 0 || bulk.pending} onClick={() => void dismissSelected()}>
          {t("dismissSelected", { count: String(chosen.length) })}
        </Button>
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
      <div className="grid gap-4 md:grid-cols-2">
        {ideas.map((idea) => (
          <SuggestionCard
            key={idea.id}
            locale={locale}
            idea={idea}
            languages={languages}
            canRequestUpgrade={canRequestUpgrade}
            selected={selected.has(idea.id)}
            onSelect={(checked) => toggle(idea.id, checked)}
          />
        ))}
      </div>
    </div>
  );
}

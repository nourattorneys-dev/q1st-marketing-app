"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { dismissSuggestionAction, draftSuggestionAction } from "@/app/[locale]/(app)/ideas/actions";
import { ActionFailure } from "@/components/actions/action-failure";
import { DraftLanguageDialog } from "@/components/drafting/draft-language-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { Suggestion } from "@/lib/engine/schemas";

type Props = {
  locale: string;
  idea: Suggestion;
  languages: string[];
  canRequestUpgrade: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
};

/** Spec v1.1 §6 /suggestions: title, type, language, keywords and why; Draft or Dismiss; a drafted idea links to its drafts. */
export function SuggestionCard({ locale, idea, languages, canRequestUpgrade, selected, onSelect }: Props) {
  const t = useTranslations("Ideas");
  const tReview = useTranslations("Review");
  const draft = useEngineAction(draftSuggestionAction);
  const dismiss = useEngineAction(dismissSuggestionAction);
  const [error, setError] = useState<EngineFailure | null>(null);
  const label = (group: "languages" | "kinds", code: string) => (tReview.has(`${group}.${code}`) ? tReview(`${group}.${code}`) : code);
  const isNew = idea.status === "new";

  async function draftIdea(language: string): Promise<EngineFailure | null> {
    const result = await draft.run({ locale, suggestionId: idea.id, language });
    return result.ok ? null : result.error;
  }

  async function dismissIdea() {
    setError(null);
    const result = await dismiss.run({ locale, suggestionId: idea.id });
    if (!result.ok) setError(result.error);
  }

  return (
    <Card data-testid={`idea-card-${idea.id}`}>
      <CardHeader className="flex flex-row items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          data-testid={`idea-select-${idea.id}`}
          aria-label={t("select", { title: idea.title })}
          checked={selected}
          disabled={!isNew}
          onChange={(event) => onSelect(event.target.checked)}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <h2 data-testid={`idea-title-${idea.id}`} lang={idea.language} dir={idea.language === "ar" ? "rtl" : "ltr"} className="font-heading text-lg">
            {idea.title}
          </h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{label("kinds", idea.kind)}</Badge>
            <Badge variant="outline">{label("languages", idea.language)}</Badge>
            {idea.keywords.map((keyword) => (
              <Badge key={keyword} variant="outline" dir="auto">
                {keyword}
              </Badge>
            ))}
            {idea.status === "drafted" && (
              <Badge variant="secondary" data-testid={`idea-drafted-${idea.id}`}>
                {t("statuses.drafted")}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {idea.why && <p className="text-muted-foreground">{t("why", { why: idea.why })}</p>}
        {idea.status === "drafting" && (
          <span data-testid={`idea-drafting-${idea.id}`} className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-hidden="true" />
            {t("statuses.drafting")}
          </span>
        )}
        {idea.postIds.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {idea.postIds.map((postId, index) => (
              <li key={postId}>
                <Link href={`/review/${postId}`} data-testid={`idea-post-${postId}`} className="text-primary underline">
                  {t("openDraft", { n: String(index + 1) })}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {isNew && (
          <div className="flex flex-wrap gap-2">
            <DraftLanguageDialog
              testId={`idea-draft-${idea.id}`}
              triggerLabel={t("draft")}
              triggerSize="sm"
              title={t("draftTitle")}
              description={t("draftBody")}
              confirmLabel={t("draftConfirm")}
              languages={languages}
              pending={draft.pending}
              locale={locale}
              canRequestUpgrade={canRequestUpgrade}
              onConfirm={draftIdea}
            />
            <Button size="sm" variant="outline" data-testid={`idea-dismiss-${idea.id}`} disabled={dismiss.pending} onClick={() => void dismissIdea()}>
              {t("dismiss")}
            </Button>
          </div>
        )}
        {error && <ActionFailure error={error} locale={locale} canRequestUpgrade={canRequestUpgrade} />}
      </CardContent>
    </Card>
  );
}

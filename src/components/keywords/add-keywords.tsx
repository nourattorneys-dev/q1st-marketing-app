"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { addKeywordsAction } from "@/app/[locale]/(app)/keywords/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import { parsePhrases } from "@/lib/keywords/phrases";

/** Spec v1.1 §6 "Add keyword(s): comma or line separated". Phrases already in the list are skipped and named. */
export function AddKeywords({ locale, languages }: { locale: string; languages: string[] }) {
  const t = useTranslations("Keywords.add");
  const tLanguages = useTranslations("Review.languages");
  const add = useEngineAction(addKeywordsAction);
  const [text, setText] = useState("");
  const [language, setLanguage] = useState(languages[0] ?? "");
  const [outcome, setOutcome] = useState<{ added: number; skipped: string[] } | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const phrases = parsePhrases(text);

  async function submit() {
    setError(null);
    setOutcome(null);
    const result = await add.run({ locale, phrases, language });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOutcome({ added: result.data.created.length, skipped: result.data.skipped });
    setText("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea data-testid="add-keywords-input" aria-label={t("title")} dir="auto" rows={3} value={text} onChange={(event) => setText(event.target.value)} />
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-keywords-language">{t("language")}</Label>
            <select
              id="add-keywords-language"
              data-testid="add-keywords-language"
              className="h-9 rounded-md border border-input bg-card px-3 text-sm"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {languages.map((code) => (
                <option key={code} value={code}>
                  {tLanguages.has(code) ? tLanguages(code) : code}
                </option>
              ))}
            </select>
          </div>
          <Button data-testid="add-keywords" disabled={phrases.length === 0 || add.pending} onClick={() => void submit()}>
            {t("submit")}
          </Button>
        </div>
        {outcome && (
          <p role="status" data-testid="keywords-added" className="text-sm">
            {t("added", { count: outcome.added, n: String(outcome.added) })}
          </p>
        )}
        {outcome && outcome.skipped.length > 0 && (
          <p data-testid="keywords-skipped" className="text-sm text-muted-foreground">
            {t("skipped", { phrases: outcome.skipped.join(", ") })}
          </p>
        )}
        {error && <ActionError error={error} />}
      </CardContent>
    </Card>
  );
}

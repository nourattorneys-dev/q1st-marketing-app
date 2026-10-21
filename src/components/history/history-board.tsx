"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { publishPostAction } from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";

/** One History row; the publish time is already formatted in the site's timezone (on the server). */
export type HistoryEntry = {
  id: string;
  title: string;
  language: string;
  status: string;
  platform: string;
  target: string | null;
  url: string | null;
  publishedAt: string | null;
  overrideReason: string | null;
  error: string | null;
  reviewNote: string | null;
  actions: string[];
};

/** Spec v1.1 §6 /history: live URL, publish time, platform, target, override reason and error; Retry for failed posts. */
export function HistoryBoard({ locale, entries, canManageSettings }: { locale: string; entries: HistoryEntry[]; canManageSettings: boolean }) {
  const t = useTranslations("History");
  const tReview = useTranslations("Review");
  const tStatus = useTranslations("Editor.status");
  const retry = useEngineAction(publishPostAction);
  const [errors, setErrors] = useState<Record<string, EngineFailure>>({});
  const statusLabel = (status: string) => (tStatus.has(status) ? tStatus(status) : status);
  const platformLabel = (platform: string) => (tReview.has(`platforms.${platform}`) ? tReview(`platforms.${platform}`) : platform);
  const targetLabel = (target: string) => (t.has(`targets.${target}`) ? t(`targets.${target}`) : target);

  async function retryPublish(id: string) {
    setErrors((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    // A Retry after a definite refusal is a new attempt: useEngineAction makes a new key (design §9).
    const result = await retry.run({ locale, postId: id });
    if (!result.ok) setErrors((current) => ({ ...current, [id]: result.error }));
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.id} data-testid={`history-item-${entry.id}`} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/review/${entry.id}`}
              lang={entry.language}
              dir={entry.language === "ar" ? "rtl" : "ltr"}
              data-testid={`history-title-${entry.id}`}
              className="font-medium hover:underline"
            >
              {entry.title}
            </Link>
            <Badge variant="secondary" data-testid={`history-status-${entry.id}`}>
              {statusLabel(entry.status)}
            </Badge>
            <Badge variant="outline">{platformLabel(entry.platform)}</Badge>
            {entry.target && (
              <Badge variant="outline" data-testid={`history-target-${entry.id}`}>
                {targetLabel(entry.target)}
              </Badge>
            )}
          </div>
          {entry.url && (
            <a href={entry.url} target="_blank" rel="noopener noreferrer" dir="ltr" data-testid={`history-url-${entry.id}`} className="text-sm text-primary underline">
              {entry.url}
            </a>
          )}
          {entry.publishedAt && (
            <p data-testid={`history-time-${entry.id}`} className="text-sm text-muted-foreground">
              {t("publishedAt", { time: entry.publishedAt })}
            </p>
          )}
          {entry.overrideReason && (
            <p data-testid={`history-override-${entry.id}`} className="text-sm">
              {t("override", { reason: entry.overrideReason })}
            </p>
          )}
          {entry.reviewNote && (
            <p data-testid={`history-note-${entry.id}`} className="text-sm">
              {t("rejectionNote", { note: entry.reviewNote })}
            </p>
          )}
          {entry.error && (
            <p data-testid={`history-error-${entry.id}`} className="text-sm text-bad-fg">
              {entry.error}
            </p>
          )}
          {entry.actions.includes("retry") && (
            <div>
              <Button size="sm" data-testid={`history-retry-${entry.id}`} disabled={retry.pending} onClick={() => void retryPublish(entry.id)}>
                {t("retry")}
              </Button>
            </div>
          )}
          {errors[entry.id] && <ActionError error={errors[entry.id]} canManageSettings={canManageSettings} />}
        </li>
      ))}
    </ul>
  );
}

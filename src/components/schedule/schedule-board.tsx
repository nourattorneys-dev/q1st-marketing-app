"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { bulkPostsAction, holdPostAction, publishPostAction } from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { ConfirmDialog } from "@/components/editor/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import { bulkFailureLines } from "@/lib/review/summary";

/** One queued post, with its expected time already formatted in the site's timezone (on the server). */
export type QueueItem = {
  id: string;
  title: string;
  language: string;
  platform: string;
  position: number | null;
  hold: boolean;
  time: string | null;
  actions: string[];
};

/** Spec v1.1 §6 /scheduled: the queue in order; hold, resume and publish now, one by one or in bulk. */
export function ScheduleBoard({ locale, items, canManageSettings }: { locale: string; items: QueueItem[]; canManageSettings: boolean }) {
  const t = useTranslations("Scheduled");
  const tReview = useTranslations("Review");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<{ id: string; title: string; message: string }[]>([]);
  const [error, setError] = useState<EngineFailure | null>(null);
  const hold = useEngineAction(holdPostAction);
  const publish = useEngineAction(publishPostAction);
  const bulk = useEngineAction(bulkPostsAction);
  const chosen = [...selected].filter((id) => items.some((item) => item.id === id && item.actions.includes("publishNow")));
  const label = (group: "languages" | "platforms", code: string) => (tReview.has(`${group}.${code}`) ? tReview(`${group}.${code}`) : code);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function setHold(id: string, held: boolean) {
    setError(null);
    const result = await hold.run({ locale, postId: id, hold: held });
    if (!result.ok) setError(result.error);
  }

  const publishOne = (id: string) => async () => {
    const result = await publish.run({ locale, postId: id });
    return result.ok ? null : result.error;
  };

  async function publishSelected() {
    const result = await bulk.run({ locale, action: "publishNow", ids: chosen });
    if (!result.ok) return result.error;
    setFailures(bulkFailureLines(result.data, items));
    setSelected(new Set(result.data.failed.map((failure) => failure.id)));
    return null;
  }

  if (items.length === 0) {
    return (
      <p data-testid="scheduled-empty" className="text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ConfirmDialog
        testId="publish-selected"
        triggerVariant="default"
        triggerLabel={t("publishSelected", { count: String(chosen.length) })}
        disabled={chosen.length === 0}
        title={t("publishSelectedTitle")}
        description={t("publishBody")}
        confirmLabel={t("publishNow")}
        pending={bulk.pending}
        onConfirm={publishSelected}
        canManageSettings={canManageSettings}
      />
      {error && <ActionError error={error} canManageSettings={canManageSettings} />}
      {failures.length > 0 && (
        <div role="alert" data-testid="bulk-failures" className="rounded-md bg-bad-bg p-3 text-sm text-bad-fg">
          <p className="font-medium">{t("bulkFailed")}</p>
          <ul className="mt-1 list-disc ps-5">
            {failures.map((failure) => (
              <li key={failure.id}>
                {failure.title}: {failure.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} data-testid={`scheduled-row-${item.id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              data-testid={`scheduled-select-${item.id}`}
              aria-label={t("select", { title: item.title })}
              checked={selected.has(item.id)}
              disabled={!item.actions.includes("publishNow")}
              onChange={(event) => toggle(item.id, event.target.checked)}
            />
            <span data-testid={`scheduled-position-${item.id}`} className="w-6 text-center font-mono text-sm text-muted-foreground">
              {item.position ?? "—"}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link
                href={`/review/${item.id}`}
                lang={item.language}
                dir={item.language === "ar" ? "rtl" : "ltr"}
                data-testid={`scheduled-title-${item.id}`}
                className="font-medium hover:underline"
              >
                {item.title}
              </Link>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">{label("languages", item.language)}</Badge>
                <Badge variant="outline">{label("platforms", item.platform)}</Badge>
                {item.hold && (
                  <Badge variant="secondary" data-testid={`scheduled-hold-${item.id}`}>
                    {t("onHold")}
                  </Badge>
                )}
              </div>
            </div>
            <span data-testid={`scheduled-time-${item.id}`} className="text-sm">
              {item.time ?? t("noTime")}
            </span>
            {item.actions.includes("hold") && (
              <Button variant="outline" size="sm" data-testid={`hold-${item.id}`} disabled={hold.pending} onClick={() => void setHold(item.id, true)}>
                {t("hold")}
              </Button>
            )}
            {item.actions.includes("resume") && (
              <Button variant="outline" size="sm" data-testid={`resume-${item.id}`} disabled={hold.pending} onClick={() => void setHold(item.id, false)}>
                {t("resume")}
              </Button>
            )}
            {item.actions.includes("publishNow") && (
              <ConfirmDialog
                testId={`publish-${item.id}`}
                triggerLabel={t("publishNow")}
                title={t("publishTitle")}
                description={t("publishBody")}
                confirmLabel={t("publishNow")}
                pending={publish.pending}
                onConfirm={publishOne(item.id)}
                canManageSettings={canManageSettings}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

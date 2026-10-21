"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { bulkPostsAction } from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { ConfirmDialog } from "@/components/editor/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { BulkAction } from "@/lib/engine/api";
import type { EngineFailure } from "@/lib/engine/result";
import type { Post } from "@/lib/engine/schemas";
import { bulkFailureLines } from "@/lib/review/summary";
import { AutoRefresh } from "./auto-refresh";
import { PostCard } from "./post-card";

type Props = { locale: string; posts: Post[]; total: number; pollSeconds: number };
type Failures = { heading: string; lines: { id: string; title: string; message: string }[] };

export function ReviewBoard({ locale, posts, total, pollSeconds }: Props) {
  const t = useTranslations("Review");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<Failures | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const bulk = useEngineAction(bulkPostsAction);
  const selectable = posts.filter((post) => post.actions.includes("approve") || post.actions.includes("publishNow"));
  const chosenFor = (action: string) => [...selected].filter((id) => posts.some((post) => post.id === id && post.actions.includes(action)));
  const toApprove = chosenFor("approve");
  const toPublish = chosenFor("publishNow");

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Runs a bulk action; posts it couldn't handle stay selected and are listed by name (spec v1.1 §6). */
  async function runBulk(action: BulkAction, ids: string[], heading: string): Promise<EngineFailure | null> {
    setError(null);
    const result = await bulk.run({ locale, action, ids });
    if (!result.ok) return result.error;
    const lines = bulkFailureLines(result.data, posts);
    setFailures(lines.length > 0 ? { heading, lines } : null);
    setSelected(new Set(result.data.failed.map((failure) => failure.id)));
    return null;
  }

  async function approveSelected() {
    const failure = await runBulk("approve", toApprove, t("bulkFailed"));
    if (failure) setError(failure);
  }

  if (posts.length === 0) return <p className="text-muted-foreground">{t("empty")}</p>;

  return (
    <div className="flex flex-col gap-4">
      {posts.some((post) => post.status === "drafting") && <AutoRefresh seconds={pollSeconds} />}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground" data-testid="review-count">
          {t("count", { shown: String(posts.length), total, n: String(total) })}
        </span>
        <Button variant="outline" size="sm" onClick={() => setSelected(new Set(selectable.map((post) => post.id)))}>
          {t("selectAll")}
        </Button>
        <Button size="sm" data-testid="approve-selected" disabled={toApprove.length === 0 || bulk.pending} onClick={() => void approveSelected()}>
          {t("approveSelected", { count: String(toApprove.length) })}
        </Button>
        <ConfirmDialog
          testId="publish-selected"
          triggerVariant="secondary"
          triggerLabel={t("publishSelected", { count: String(toPublish.length) })}
          disabled={toPublish.length === 0}
          title={t("publishSelectedTitle")}
          description={t("publishSelectedBody")}
          confirmLabel={t("publishNow")}
          pending={bulk.pending}
          onConfirm={() => runBulk("publishNow", toPublish, t("bulkPublishFailed"))}
        />
      </div>
      {error && <ActionError error={error} />}
      {failures && (
        <div role="alert" data-testid="bulk-failures" className="rounded-md bg-bad-bg p-3 text-sm text-bad-fg">
          <p className="font-medium">{failures.heading}</p>
          <ul className="mt-1 list-disc ps-5">
            {failures.lines.map((failure) => (
              <li key={failure.id}>
                {failure.title}: {failure.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} selected={selected.has(post.id)} onSelect={(checked) => toggle(post.id, checked)} />
        ))}
      </div>
    </div>
  );
}

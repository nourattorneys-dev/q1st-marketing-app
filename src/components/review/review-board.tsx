"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { bulkPostsAction } from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { Post } from "@/lib/engine/schemas";
import { bulkFailureLines } from "@/lib/review/summary";
import { AutoRefresh } from "./auto-refresh";
import { PostCard } from "./post-card";

type Props = { locale: string; posts: Post[]; total: number; pollSeconds: number };

export function ReviewBoard({ locale, posts, total, pollSeconds }: Props) {
  const t = useTranslations("Review");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<{ id: string; title: string; message: string }[]>([]);
  const [error, setError] = useState<EngineFailure | null>(null);
  const bulk = useEngineAction(bulkPostsAction);
  const selectable = posts.filter((post) => post.actions.includes("approve"));
  const chosen = [...selected].filter((id) => selectable.some((post) => post.id === id));

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function approveSelected() {
    setError(null);
    const result = await bulk.run({ locale, action: "approve", ids: chosen });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFailures(bulkFailureLines(result.data, posts));
    setSelected(new Set(result.data.failed.map((failure) => failure.id)));
  }

  if (posts.length === 0) return <p className="text-muted-foreground">{t("empty")}</p>;

  return (
    <div className="flex flex-col gap-4">
      {posts.some((post) => post.status === "drafting") && <AutoRefresh seconds={pollSeconds} />}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground" data-testid="review-count">
          {t("count", { shown: String(posts.length), total: String(total) })}
        </span>
        <Button variant="outline" size="sm" onClick={() => setSelected(new Set(selectable.map((post) => post.id)))}>
          {t("selectAll")}
        </Button>
        <Button size="sm" data-testid="approve-selected" disabled={chosen.length === 0 || bulk.pending} onClick={approveSelected}>
          {t("approveSelected", { count: String(chosen.length) })}
        </Button>
      </div>
      {error && <ActionError error={error} />}
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
      <div className="grid gap-4 md:grid-cols-2">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} selected={selected.has(post.id)} onSelect={(checked) => toggle(post.id, checked)} />
        ))}
      </div>
    </div>
  );
}

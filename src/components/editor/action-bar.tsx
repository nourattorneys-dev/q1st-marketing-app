"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { approvePostAction, deletePostAction, rejectPostAction, requestChangesAction } from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { Post } from "@/lib/engine/schemas";
import { approvalMode } from "@/lib/posts/rules";
import { ConfirmDialog } from "./confirm-dialog";
import { JobProgress } from "./job-progress";
import { StatusWatcher } from "./status-watcher";

type Props = { locale: string; post: Post; dirty: boolean; pollSeconds: number };

/** Buttons come from post.actions (spec v1.1 §5); approval follows the findings (direct, override with reason, or blocked). */
export function ActionBar({ locale, post, dirty, pollSeconds }: Props) {
  const t = useTranslations("Editor");
  const router = useRouter();
  const approve = useEngineAction(approvePostAction);
  const changes = useEngineAction(requestChangesAction);
  const reject = useEngineAction(rejectPostAction);
  const remove = useEngineAction(deletePostAction);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  // A full reload: the editor keeps its own form state, so only a fresh page shows the redrafted content.
  const finishJob = useCallback(() => window.location.reload(), []);

  const allowed = new Set(post.actions);
  const mode = approvalMode(post.findings);

  async function approveDirectly() {
    setError(null);
    const result = await approve.run({ locale, postId: post.id });
    if (!result.ok) setError(result.error);
  }

  const approveWithReason = async (reason: string) => {
    const result = await approve.run({ locale, postId: post.id, overrideReason: reason });
    return result.ok ? null : result.error;
  };
  const askForChanges = async (note: string) => {
    const result = await changes.run({ locale, postId: post.id, note });
    if (!result.ok) return result.error;
    setJobId(result.data.jobId);
    return null;
  };
  const rejectPost = async (note: string) => {
    const result = await reject.run({ locale, postId: post.id, note: note || undefined });
    return result.ok ? null : result.error;
  };
  const deletePost = async () => {
    const result = await remove.run({ locale, postId: post.id });
    if (!result.ok) return result.error;
    router.push("/review");
    return null;
  };

  return (
    <div className="flex flex-col gap-2">
      {jobId && <JobProgress locale={locale} jobId={jobId} pollSeconds={pollSeconds} onDone={finishJob} />}
      {!jobId && post.status === "drafting" && <StatusWatcher locale={locale} postId={post.id} status={post.status} pollSeconds={pollSeconds} />}
      <div className="flex flex-wrap items-center gap-2">
        {allowed.has("approve") && mode === "direct" && (
          <Button data-testid="approve" disabled={dirty || approve.pending} onClick={() => void approveDirectly()}>
            {t("approve")}
          </Button>
        )}
        {allowed.has("approve") && mode === "override" && (
          <ConfirmDialog
            testId="approve"
            triggerVariant="default"
            triggerLabel={t("approve")}
            disabled={dirty}
            title={t("overrideTitle")}
            description={t("overrideBody")}
            confirmLabel={t("approveAnyway")}
            note={{ label: t("overrideReason"), required: true }}
            pending={approve.pending}
            onConfirm={approveWithReason}
          />
        )}
        {allowed.has("approve") && mode === "blocked" && (
          <Button data-testid="approve" disabled>
            {t("approve")}
          </Button>
        )}
        {allowed.has("changes") && (
          <ConfirmDialog
            testId="changes"
            triggerLabel={t("changes")}
            title={t("changes")}
            description={t("changesBody")}
            confirmLabel={t("send")}
            note={{ label: t("changesNote"), required: true }}
            pending={changes.pending}
            onConfirm={askForChanges}
          />
        )}
        {allowed.has("reject") && (
          <ConfirmDialog
            testId="reject"
            triggerLabel={t("reject")}
            title={t("rejectTitle")}
            description={t("rejectBody")}
            confirmLabel={t("reject")}
            note={{ label: t("rejectNote"), required: false }}
            pending={reject.pending}
            onConfirm={rejectPost}
          />
        )}
        {allowed.has("delete") && (
          <ConfirmDialog
            testId="delete"
            triggerVariant="destructive"
            triggerLabel={t("delete")}
            title={t("deleteTitle")}
            description={t("deleteBody")}
            confirmLabel={t("delete")}
            pending={remove.pending}
            onConfirm={deletePost}
          />
        )}
      </div>
      {allowed.has("approve") && mode === "blocked" && (
        <p data-testid="approve-blocked" className="text-sm text-bad-fg">
          {t("approveBlockedHint")}
        </p>
      )}
      {allowed.has("approve") && mode !== "blocked" && dirty && <p className="text-sm text-muted-foreground">{t("saveFirst")}</p>}
      {error && <ActionError error={error} />}
    </div>
  );
}

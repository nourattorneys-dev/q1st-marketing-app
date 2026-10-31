"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import {
  approvePostAction,
  deletePostAction,
  publishPostAction,
  rejectPostAction,
  requestChangesAction,
} from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { Post } from "@/lib/engine/schemas";
import { approvalMode, needsPhoto } from "@/lib/posts/rules";
import { ConfirmDialog } from "./confirm-dialog";
import { JobProgress } from "./job-progress";
import { StatusWatcher } from "./status-watcher";

type Props = {
  locale: string;
  post: Post;
  dirty: boolean;
  pollSeconds: number;
  lockedBy: string | null;
  onLocked: (by: string) => void;
  canManageSettings: boolean;
};

/** Buttons come from post.actions (spec v1.1 §5); approval and publishing follow the findings. Nothing runs while someone else holds the lock. */
export function ActionBar({ locale, post, dirty, pollSeconds, lockedBy, onLocked, canManageSettings }: Props) {
  const t = useTranslations("Editor");
  const router = useRouter();
  const approve = useEngineAction(approvePostAction);
  const changes = useEngineAction(requestChangesAction);
  const reject = useEngineAction(rejectPostAction);
  const remove = useEngineAction(deletePostAction);
  const publish = useEngineAction(publishPostAction);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  // A full reload: the editor keeps its own form state, so only a fresh page shows the redrafted content.
  const finishJob = useCallback(() => window.location.reload(), []);

  const allowed = new Set(post.actions);
  const mode = approvalMode(post.findings);
  const locked = lockedBy !== null;
  // Publishing straight from review needs what approval needs; with a critical finding, approve with a reason first.
  // A rule that can't be overridden blocks publishing in any status (an approved twin can stop matching later).
  const publishable = mode !== "blocked" && (post.status !== "pending" || mode === "direct");
  // Spec v1.1 §4 Post.image: an Instagram post can't be approved or published without a photo.
  const photoMissing = needsPhoto(post);

  /** A refusal because someone else took the lock shows the lock banner (with Take over) instead of an error. */
  function refusal(failure: EngineFailure): EngineFailure | null {
    if (failure.code !== "locked") return failure;
    onLocked(String(failure.details?.lockedBy ?? ""));
    return null;
  }

  async function approveDirectly() {
    setError(null);
    const result = await approve.run({ locale, postId: post.id });
    if (!result.ok) setError(refusal(result.error));
  }

  const approveWithReason = async (reason: string) => {
    const result = await approve.run({ locale, postId: post.id, overrideReason: reason });
    return result.ok ? null : refusal(result.error);
  };
  const askForChanges = async (note: string) => {
    const result = await changes.run({ locale, postId: post.id, note });
    if (!result.ok) return refusal(result.error);
    setJobId(result.data.jobId);
    return null;
  };
  const rejectPost = async (note: string) => {
    const result = await reject.run({ locale, postId: post.id, note: note || undefined });
    return result.ok ? null : refusal(result.error);
  };
  const deletePost = async () => {
    const result = await remove.run({ locale, postId: post.id });
    if (!result.ok) return refusal(result.error);
    router.push("/review");
    return null;
  };
  const publishPost = async (_note: string, withTwin: boolean) => {
    const result = await publish.run({ locale, postId: post.id, withTwin: post.canPublishTwin === true && withTwin });
    return result.ok ? null : refusal(result.error);
  };

  return (
    <div className="flex flex-col gap-2">
      {jobId && <JobProgress jobId={jobId} pollSeconds={pollSeconds} onDone={finishJob} />}
      {!jobId && post.status === "drafting" && <StatusWatcher locale={locale} postId={post.id} status={post.status} pollSeconds={pollSeconds} />}
      <div className="flex flex-wrap items-center gap-2">
        {allowed.has("approve") && mode === "direct" && (
          <Button data-testid="approve" disabled={dirty || locked || approve.pending || photoMissing} onClick={() => void approveDirectly()}>
            {t("approve")}
          </Button>
        )}
        {allowed.has("approve") && mode === "override" && (
          <ConfirmDialog
            testId="approve"
            triggerVariant="default"
            triggerLabel={t("approve")}
            disabled={dirty || locked || photoMissing}
            title={t("overrideTitle")}
            description={post.reasonRequired ? t("overrideBody") : t("overrideBodyOptional")}
            confirmLabel={t("approveAnyway")}
            note={{ label: post.reasonRequired ? t("overrideReason") : t("overrideReasonOptional"), required: post.reasonRequired === true }}
            pending={approve.pending}
            onConfirm={approveWithReason}
          />
        )}
        {allowed.has("approve") && mode === "blocked" && (
          <Button data-testid="approve" disabled>
            {t("approve")}
          </Button>
        )}
        {allowed.has("publishNow") && (
          <ConfirmDialog
            testId="publish"
            triggerVariant="secondary"
            triggerLabel={t("publishNow")}
            disabled={dirty || locked || !publishable || photoMissing}
            title={t("publishTitle")}
            description={post.status === "pending" ? t("publishBodyPending") : t("publishBody")}
            confirmLabel={t("publishNow")}
            pending={publish.pending}
            pendingLabel={t("publishing")}
            option={post.canPublishTwin && post.twin ? { label: t("publishWithTwin"), defaultChecked: true } : undefined}
            onConfirm={publishPost}
            canManageSettings={canManageSettings}
          />
        )}
        {allowed.has("changes") && (
          <ConfirmDialog
            testId="changes"
            triggerLabel={t("changes")}
            disabled={dirty || locked}
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
            disabled={dirty || locked}
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
            disabled={locked}
            title={t("deleteTitle")}
            description={t("deleteBody")}
            confirmLabel={t("delete")}
            pending={remove.pending}
            onConfirm={deletePost}
          />
        )}
      </div>
      {post.waitsForSource && post.twin && (
        <p data-testid="waits-for-source" className="text-sm text-muted-foreground">
          {t("waitsForSource")}{" "}
          <Link href={`/review/${post.twin.id}`} className="text-primary underline">
            {t("openSource")}
          </Link>
        </p>
      )}
      {(allowed.has("approve") || allowed.has("publishNow")) && photoMissing && (
        <p data-testid="photo-needed" className="text-sm text-bad-fg">
          {t("photoNeeded")}
        </p>
      )}
      {(allowed.has("approve") || allowed.has("publishNow")) && mode === "blocked" && (
        <p data-testid="approve-blocked" className="text-sm text-bad-fg">
          {t("approveBlockedHint")}
        </p>
      )}
      {allowed.has("publishNow") && post.status === "pending" && mode === "override" && (
        <p data-testid="publish-needs-approval" className="text-sm text-muted-foreground">
          {t("publishNeedsApproval")}
        </p>
      )}
      {dirty && ["approve", "publishNow", "changes", "reject"].some((action) => allowed.has(action)) && (
        <p data-testid="save-first" className="text-sm text-muted-foreground">
          {t("saveFirst")}
        </p>
      )}
      {error && <ActionError error={error} canManageSettings={canManageSettings} />}
    </div>
  );
}

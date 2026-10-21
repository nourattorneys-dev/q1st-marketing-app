"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  loadPostAction,
  lockPostAction,
  savePostAction,
  takeoverPostAction,
  unlockPostAction,
} from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import { changedFields, toEditable, type EditableFields } from "@/lib/editor/changed-fields";
import type { EngineFailure } from "@/lib/engine/result";
import type { Category, Post } from "@/lib/engine/schemas";
import { ChecksPanel } from "./checks-panel";
import { ConflictPanel } from "./conflict-panel";
import { EditorBody } from "./editor-body";
import { EditorFooter } from "./editor-footer";
import { FieldCounter } from "./field-counter";
import { KeywordChips } from "./keyword-chips";
import { LockBanner } from "./lock-banner";
import { SourcesList } from "./sources-list";

type Props = {
  locale: string;
  post: Post;
  twin: Post | null;
  limits: { metaTitle: number; metaDescription: number };
  categories: Category[];
  lockMinutes: number;
  pollSeconds: number;
};

const parseHashtags = (text: string) => text.split(",").map((tag) => tag.trim()).filter(Boolean);

export function PostEditor({ locale, post, twin, limits, categories, lockMinutes, pollSeconds }: Props) {
  const t = useTranslations("Editor");
  const [saved, setSaved] = useState<Post | null>(null);
  // The newest version wins: my last save, or what the server re-rendered after refresh().
  const current = saved && saved.version >= post.version ? saved : post;
  const [form, setForm] = useState<EditableFields>(() => toEditable(post));
  const [hashtagText, setHashtagText] = useState(() => post.hashtags.join(", "));
  const [bodyKey, setBodyKey] = useState(0);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Post | null>(null);
  const [savedNow, setSavedNow] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);
  const save = useEngineAction(savePostAction);
  const takeover = useEngineAction(takeoverPostAction);
  const takeLock = useEngineAction(lockPostAction).run;

  const canEdit = current.actions.includes("edit");
  const editable = canEdit && lockedBy === null;
  const dirty = changedFields(form, toEditable(current)).length > 0;
  const dir = current.language === "ar" ? "rtl" : "ltr";

  // Spec v1.1 §3: take the lock on open, renew it while editing, release it on leaving.
  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    async function acquire() {
      const result = await takeLock({ locale, postId: post.id });
      if (!active) return;
      setLockedBy(!result.ok && result.error.code === "locked" ? String(result.error.details?.lockedBy ?? "") : null);
    }
    void acquire();
    const timer = setInterval(acquire, Math.max(30, lockMinutes * 30) * 1000);
    return () => {
      active = false;
      clearInterval(timer);
      void unlockPostAction({ locale, postId: post.id, idempotencyKey: crypto.randomUUID() });
    };
  }, [canEdit, locale, lockMinutes, post.id, takeLock]);

  function set<K extends keyof EditableFields>(key: K) {
    return (value: EditableFields[K]) => {
      setSavedNow(false);
      setForm((previous) => ({ ...previous, [key]: value }));
    };
  }

  async function persist(version: number) {
    setError(null);
    setSavedNow(false);
    const result = await save.run({ locale, postId: post.id, update: { ...form, version } });
    if (result.ok) {
      setSaved(result.data);
      setSavedNow(true);
      return;
    }
    if (result.error.code === "version_conflict") {
      const theirs = await loadPostAction({ locale, postId: post.id });
      if (theirs.ok) setConflict(theirs.data);
      else setError(theirs.error);
      return;
    }
    if (result.error.code === "locked") {
      setLockedBy(String(result.error.details?.lockedBy ?? ""));
      return;
    }
    setError(result.error);
  }

  function loadTheirs() {
    if (!conflict) return;
    setSaved(conflict);
    setForm(toEditable(conflict));
    setHashtagText(conflict.hashtags.join(", "));
    setBodyKey((key) => key + 1);
    setConflict(null);
  }

  async function keepMine() {
    if (!conflict) return;
    const version = conflict.version;
    setSaved(conflict);
    setConflict(null);
    await persist(version);
  }

  async function takeOver() {
    const result = await takeover.run({ locale, postId: post.id });
    if (result.ok) {
      setLockedBy(null);
      setSaved(result.data);
    } else {
      setError(result.error);
    }
  }

  const statusLabel = t.has(`status.${current.status}`) ? t(`status.${current.status}`) : current.status;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/review" className="text-sm text-muted-foreground hover:underline">
          {t("back")}
        </Link>
        <Badge variant="secondary" data-testid="post-status">
          {statusLabel}
        </Badge>
        {savedNow && (
          <span data-testid="save-status" className="text-sm text-ok-fg">
            {t("saved")}
          </span>
        )}
      </div>

      {lockedBy !== null && <LockBanner name={lockedBy || "?"} pending={takeover.pending} onTakeover={takeOver} />}
      {conflict && (
        <ConflictPanel fields={changedFields(form, toEditable(conflict))} pending={save.pending} onLoadTheirs={loadTheirs} onKeepMine={keepMine} />
      )}
      {current.reviewNote && (
        <p className="rounded-md bg-info-bg px-3 py-2 text-sm text-info-fg">{t("reviewNote", { note: current.reviewNote })}</p>
      )}
      {error && <ActionError error={error} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4" lang={current.language}>
          <FieldCounter id="title" testId="field-title" label={t("fields.title")} value={form.title} onChange={set("title")} disabled={!editable} dir={dir} />
          <FieldCounter
            id="subtitle"
            testId="field-subtitle"
            label={t("fields.subtitle")}
            value={form.subtitle ?? ""}
            onChange={(value) => set("subtitle")(value || null)}
            disabled={!editable}
            dir={dir}
          />
          <EditorBody
            kind={current.kind}
            language={current.language}
            value={form.content}
            editable={editable}
            onChange={set("content")}
            bodyKey={bodyKey}
            twin={twin}
          />
          {current.kind === "social" ? (
            <FieldCounter
              id="hashtags"
              testId="field-hashtags"
              label={t("fields.hashtags")}
              hint={t("hashtagsHint")}
              value={hashtagText}
              onChange={(value) => {
                setHashtagText(value);
                set("hashtags")(parseHashtags(value));
              }}
              disabled={!editable}
            />
          ) : (
            <>
              <FieldCounter id="slug" testId="field-slug" label={t("fields.slug")} value={form.slug ?? ""} onChange={(value) => set("slug")(value || null)} disabled={!editable} dir="ltr" />
              <FieldCounter
                id="meta-title"
                testId="field-meta-title"
                label={t("fields.metaTitle")}
                value={form.metaTitle ?? ""}
                limit={limits.metaTitle}
                onChange={(value) => set("metaTitle")(value || null)}
                disabled={!editable}
                dir={dir}
              />
              <FieldCounter
                id="meta-description"
                testId="field-meta-description"
                label={t("fields.metaDescription")}
                value={form.metaDescription ?? ""}
                limit={limits.metaDescription}
                multiline
                onChange={(value) => set("metaDescription")(value || null)}
                disabled={!editable}
                dir={dir}
              />
              <KeywordChips value={form.keywords} onChange={set("keywords")} disabled={!editable} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="section">{t("fields.section")}</Label>
                <select
                  id="section"
                  data-testid="field-section"
                  className="h-9 rounded-md border border-input bg-card px-3 text-sm"
                  value={form.section ?? ""}
                  disabled={!editable}
                  onChange={(event) => set("section")(event.target.value || null)}
                >
                  <option value="">{t("noSection")}</option>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          <ChecksPanel post={current} />
          <SourcesList post={current} />
        </aside>
      </div>

      <EditorFooter
        locale={locale}
        post={current}
        dirty={dirty}
        editable={editable}
        saving={save.pending}
        onSave={() => void persist(current.version)}
        pollSeconds={pollSeconds}
      />
    </div>
  );
}

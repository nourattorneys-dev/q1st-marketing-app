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
import { changedFields, toEditable, toUpdate, type EditableFields } from "@/lib/editor/changed-fields";
import { afterSave, draftOf, edit, rebase, unsavedFields, withMyChanges, withServerImage, type Draft } from "@/lib/editor/draft";
import { fieldErrors } from "@/lib/editor/field-errors";
import type { EngineFailure } from "@/lib/engine/result";
import type { Category, Post } from "@/lib/engine/schemas";
import { ChecksPanel } from "./checks-panel";
import { ConflictPanel } from "./conflict-panel";
import { EditorBody } from "./editor-body";
import { EditorFooter } from "./editor-footer";
import { FieldCounter, FieldError } from "./field-counter";
import { KeywordChips } from "./keyword-chips";
import { LockBanner } from "./lock-banner";
import { PhotoPanel, type PhotoLimits } from "./photo-panel";
import { SourcesList } from "./sources-list";

type Props = {
  locale: string;
  post: Post;
  twin: Post | null;
  limits: { metaTitle: number; metaDescription: number };
  photoLimits: PhotoLimits;
  categories: Category[];
  lockMinutes: number;
  pollSeconds: number;
};

const parseHashtags = (text: string) => text.split(",").map((tag) => tag.trim()).filter(Boolean);

export function PostEditor({ locale, post, twin, limits, photoLimits, categories, lockMinutes, pollSeconds }: Props) {
  const t = useTranslations("Editor");
  const [saved, setSaved] = useState<Post | null>(null);
  // The newest version wins for status, checks and actions: my last save, or what the server re-rendered after refresh().
  const current = saved && saved.version >= post.version ? saved : post;
  const [draft, setDraft] = useState<Draft>(() => draftOf(post));
  const form = draft.form;
  const [seenPost, setSeenPost] = useState(post);
  const [hashtagText, setHashtagText] = useState(() => post.hashtags.join(", "));
  const [bodyKey, setBodyKey] = useState(0);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Post | null>(null);
  const [savedNow, setSavedNow] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);
  const save = useEngineAction(savePostAction);
  const takeover = useEngineAction(takeoverPostAction);

  const canEdit = current.actions.includes("edit");
  const editable = canEdit && lockedBy === null;
  const dirty = unsavedFields(draft).length > 0;
  const dir = current.language === "ar" ? "rtl" : "ltr";
  const errors = fieldErrors(error);

  /** Show fields that came from the server rather than from typing: the body and the hashtag text reload too. */
  function show(next: Draft) {
    setDraft(next);
    setHashtagText(next.form.hashtags.join(", "));
    setBodyKey((key) => key + 1);
  }

  // A newer version arrived (a refresh after an action, or Next kept this page alive while someone else saved). It's
  // shown if nothing is unsaved; otherwise the edits stay on their old version, so saving them reports a conflict.
  if (post !== seenPost) {
    setSeenPost(post);
    const next = rebase(draft, post);
    if (next !== draft) show(next);
  }

  // Spec v1.1 §3: take the lock on open, renew it while editing, release it on leaving.
  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    async function acquire() {
      const result = await lockPostAction({ locale, postId: post.id, idempotencyKey: crypto.randomUUID() }).catch(() => null);
      if (!active || !result) return;
      const failure: EngineFailure | null = result.ok ? null : result.error;
      setLockedBy(failure?.code === "locked" ? String(failure.details?.lockedBy ?? "") : null);
    }
    void acquire();
    const timer = setInterval(acquire, Math.max(30, lockMinutes * 30) * 1000);
    return () => {
      active = false;
      clearInterval(timer);
      void unlockPostAction({ locale, postId: post.id, idempotencyKey: crypto.randomUUID() });
    };
  }, [canEdit, locale, lockMinutes, post.id]);

  function set<K extends keyof EditableFields>(key: K) {
    return (value: EditableFields[K]) => {
      setSavedNow(false);
      setDraft((previous) => edit(previous, key, value));
    };
  }

  /** Saves with the version the fields started from, so a newer save by someone else comes back as a conflict. */
  async function persist(toSave: Draft) {
    setError(null);
    setSavedNow(false);
    const sent = toSave.form;
    const result = await save.run({ locale, postId: post.id, update: toUpdate(sent, toSave.version) });
    if (result.ok) {
      setSaved(result.data);
      setDraft((latest) => afterSave(latest, sent, result.data));
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
    show(draftOf(conflict));
    setConflict(null);
  }

  async function keepMine() {
    if (!conflict) return;
    const next = withMyChanges(draft, conflict);
    setSaved(conflict);
    setConflict(null);
    show(next);
    await persist(next);
  }

  async function takeOver() {
    const result = await takeover.run({ locale, postId: post.id });
    if (result.ok) {
      setLockedBy(null);
      setSaved(result.data);
      // Whatever the previous holder saved replaces this page's copy (nothing could be edited while locked out).
      const next = rebase(draft, result.data);
      if (next !== draft) show(next);
    } else {
      setError(result.error);
    }
  }

  /** After a photo change: reload the post (the image endpoints answer with the photo only) and follow its photo. */
  async function photoChanged() {
    const fresh = await loadPostAction({ locale, postId: post.id });
    if (!fresh.ok) {
      setError(fresh.error);
      return;
    }
    setSaved(fresh.data);
    setDraft((latest) => withServerImage(latest, fresh.data));
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
        {current.published && (
          <a href={current.published.url} target="_blank" rel="noopener noreferrer" dir="ltr" data-testid="published-link" className="text-sm text-primary underline">
            {t("viewLive")}
          </a>
        )}
      </div>

      {lockedBy !== null && <LockBanner name={lockedBy || "?"} pending={takeover.pending} onTakeover={takeOver} />}
      {conflict && (
        <ConflictPanel
          fields={changedFields(form, toEditable(conflict))}
          mine={form}
          theirs={toEditable(conflict)}
          pending={save.pending}
          onLoadTheirs={loadTheirs}
          onKeepMine={keepMine}
        />
      )}
      {current.reviewNote && (
        <p className="rounded-md bg-info-bg px-3 py-2 text-sm text-info-fg">{t("reviewNote", { note: current.reviewNote })}</p>
      )}
      {error && <ActionError error={error} />}
      {errors.other.length > 0 && (
        <ul className="list-disc ps-5 text-sm text-bad-fg">
          {errors.other.map((item) => (
            <li key={item.field}>
              {item.field}: {item.message}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4" lang={current.language}>
          <FieldCounter id="title" error={errors.byField.title} testId="field-title" label={t("fields.title")} value={form.title} onChange={set("title")} disabled={!editable} dir={dir} />
          <FieldCounter
            id="subtitle" error={errors.byField.subtitle}
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
          {errors.byField.content && <FieldError testId="field-content-error" message={errors.byField.content} />}
          {current.kind === "social" ? (
            <FieldCounter
              id="hashtags" error={errors.byField.hashtags}
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
              <FieldCounter id="slug" error={errors.byField.slug} testId="field-slug" label={t("fields.slug")} value={form.slug ?? ""} onChange={(value) => set("slug")(value || null)} disabled={!editable} dir="ltr" />
              <FieldCounter
                id="meta-title" error={errors.byField.metaTitle}
                testId="field-meta-title"
                label={t("fields.metaTitle")}
                value={form.metaTitle ?? ""}
                limit={limits.metaTitle}
                onChange={(value) => set("metaTitle")(value || null)}
                disabled={!editable}
                dir={dir}
              />
              <FieldCounter
                id="meta-description" error={errors.byField.metaDescription}
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
              {errors.byField.keywords && <FieldError testId="field-keywords-error" message={errors.byField.keywords} />}
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
                {errors.byField.section && <FieldError testId="field-section-error" message={errors.byField.section} />}
              </div>
            </>
          )}
        </div>
        <aside className="flex flex-col gap-4">
          <PhotoPanel
            locale={locale}
            post={current}
            editable={editable}
            text={form.image}
            onTextChange={set("image")}
            onChanged={photoChanged}
            limits={photoLimits}
            error={errors.byField.image}
          />
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
        onSave={() => void persist(draft)}
        pollSeconds={pollSeconds}
        lockedBy={lockedBy}
        onLocked={setLockedBy}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/actions/result";
import type { EngineFailure } from "@/lib/engine/result";
import { afterSave, changedKeys, draftOf, rebase, unsavedKeys, withMyChanges, type SettingsDraft } from "@/lib/settings/draft";

type Options<M extends { version: number }, F extends object> = {
  /** The model as the server last rendered it; a refresh after a save (or someone else's) brings a newer one. */
  saved: M;
  toForm: (model: M) => F;
  save: (form: F, version: number) => Promise<ActionResult<M>>;
  load: () => Promise<ActionResult<M>>;
};

/**
 * A settings form over a versioned model (spec v1.1 §4). A save sends the version the form started from. A newer
 * version replaces the form only when nothing is unsaved, and a 409 shows both versions with Keep my changes / Use the
 * saved version (design §9).
 */
export function useSettingsDraft<M extends { version: number }, F extends object>({ saved, toForm, save, load }: Options<M, F>) {
  const [draft, setDraft] = useState<SettingsDraft<F>>(() => draftOf(toForm(saved), saved.version));
  const [seen, setSeen] = useState(saved);
  const [theirs, setTheirs] = useState<M | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [savedNow, setSavedNow] = useState(false);
  const [pending, setPending] = useState(false);

  if (saved !== seen) {
    setSeen(saved);
    const next = rebase(draft, toForm(saved), saved.version);
    if (next !== draft) setDraft(next);
  }

  function update(change: (form: F) => F) {
    setSavedNow(false);
    setDraft((current) => ({ ...current, form: change(current.form) }));
  }

  async function persist(toSave: SettingsDraft<F>): Promise<boolean> {
    setError(null);
    setSavedNow(false);
    setPending(true);
    try {
      const sent = toSave.form;
      const result = await save(sent, toSave.version);
      if (result.ok) {
        setDraft((latest) => afterSave(latest, sent, toForm(result.data), result.data.version));
        setSavedNow(true);
        return true;
      }
      if (result.error.code === "version_conflict") {
        const latest = await load();
        if (latest.ok) setTheirs(latest.data);
        else setError(latest.error);
        return false;
      }
      setError(result.error);
      return false;
    } finally {
      setPending(false);
    }
  }

  function loadTheirs() {
    if (!theirs) return;
    setDraft(draftOf(toForm(theirs), theirs.version));
    setTheirs(null);
  }

  async function keepMine() {
    if (!theirs) return;
    const next = withMyChanges(draft, toForm(theirs), theirs.version);
    setTheirs(null);
    setDraft(next);
    await persist(next);
  }

  const theirForm = theirs ? toForm(theirs) : null;
  return {
    form: draft.form,
    base: draft.base,
    unsaved: unsavedKeys(draft),
    update,
    save: () => persist(draft),
    pending,
    savedNow,
    error,
    conflict: theirForm ? { theirs: theirForm, keys: changedKeys(draft.form, theirForm) } : null,
    loadTheirs,
    keepMine,
  };
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { searchPhotosAction } from "@/app/[locale]/(app)/review/photo-actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NETWORK_FAILURE } from "@/lib/actions/result";
import type { EngineFailure } from "@/lib/engine/result";
import type { Photo } from "@/lib/engine/schemas";

type Props = { locale: string; initialQuery: string; disabled: boolean; onPick: (photo: Photo) => Promise<EngineFailure | null> };

/** A Pexels grid (spec v1.1 §6 "Find a photo"); the search starts from the post's photoIdea. */
export function PhotoPicker({ locale, initialQuery, disabled, onPick }: Props) {
  const t = useTranslations("Editor.photo");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);

  async function search(nextPage: number) {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await searchPhotosAction({ locale, query: query.trim(), page: nextPage });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPhotos((current) => (nextPage === 1 ? result.data : [...current, ...result.data]));
      setPage(nextPage);
      setSearched(true);
    } catch {
      setError(NETWORK_FAILURE);
    } finally {
      setBusy(false);
    }
  }

  async function choose(photo: Photo) {
    setBusy(true);
    const failure = await onPick(photo);
    setBusy(false);
    if (failure) setError(failure);
    else setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !searched && query.trim()) void search(1);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" disabled={disabled} data-testid="photo-find">
          {t("find")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("pickerTitle")}</DialogTitle>
          <DialogDescription>{t("pickerBody")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void search(1);
          }}
        >
          <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("searchLabel")} data-testid="photo-search-input" />
          <Button type="submit" disabled={busy || !query.trim()} data-testid="photo-search">
            {t("search")}
          </Button>
        </form>
        {error && <ActionError error={error} />}
        {searched && photos.length === 0 && <p className="text-sm text-muted-foreground">{t("noResults")}</p>}
        <ul className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.pexelsId} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element -- Pexels thumbnails come from Pexels' own hosts */}
              <img src={photo.thumb} alt={photo.alt ?? ""} className="aspect-[3/2] w-full rounded object-cover" />
              <span className="text-xs text-muted-foreground">{t("by", { name: photo.photographer })}</span>
              <Button type="button" size="xs" variant="outline" disabled={busy} data-testid={`photo-use-${photo.pexelsId}`} onClick={() => void choose(photo)}>
                {t("use")}
              </Button>
            </li>
          ))}
        </ul>
        {photos.length > 0 && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void search(page + 1)} data-testid="photo-more">
            {t("more")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

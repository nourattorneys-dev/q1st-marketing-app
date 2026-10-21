"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { pickPhotoAction, removePhotoAction, uploadPhotoAction } from "@/app/[locale]/(app)/review/photo-actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEngineAction, useEngineUpload } from "@/lib/actions/use-engine-action";
import type { ImageText } from "@/lib/editor/changed-fields";
import type { EngineFailure } from "@/lib/engine/result";
import type { Photo, Post } from "@/lib/engine/schemas";
import { FieldError } from "./field-counter";
import { PhotoPicker } from "./photo-picker";

export type PhotoLimits = { photoTypes: string[]; photoMaxBytes: number };

type Props = {
  locale: string;
  post: Post;
  editable: boolean;
  text: ImageText | null;
  onTextChange: (text: ImageText) => void;
  onChanged: () => Promise<void>;
  limits: PhotoLimits;
  error?: string;
};

const megabytes = (bytes: number) => String(Math.round((bytes / 1_048_576) * 10) / 10);

/** Spec v1.1 §6 photo panel: the suggested search, a Pexels picker, upload, remove, and the photo's alt text and credit. */
export function PhotoPanel({ locale, post, editable, text, onTextChange, onChanged, limits, error }: Props) {
  const t = useTranslations("Editor.photo");
  const pick = useEngineAction(pickPhotoAction);
  const remove = useEngineAction(removePhotoAction);
  const upload = useEngineUpload(uploadPhotoAction);
  const [failure, setFailure] = useState<EngineFailure | null>(null);
  const [tooLarge, setTooLarge] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const image = post.image;
  const busy = pick.pending || remove.pending || upload.pending;

  async function choose(photo: Photo): Promise<EngineFailure | null> {
    setFailure(null);
    const result = await pick.run({ locale, postId: post.id, pexelsId: photo.pexelsId, alt: photo.alt ?? undefined });
    if (!result.ok) return result.error;
    await onChanged();
    return null;
  }

  async function uploadFile(file: File) {
    setFailure(null);
    setTooLarge(null);
    // The engine checks the type (its message is shown, spec v1.1 §10); the size is checked here, before the upload starts.
    if (file.size > limits.photoMaxBytes) {
      setTooLarge(t("tooLarge", { size: megabytes(file.size), limit: megabytes(limits.photoMaxBytes) }));
    } else {
      const result = await upload.run({ locale, postId: post.id }, file);
      if (result.ok) await onChanged();
      else setFailure(result.error);
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function removePhoto() {
    setFailure(null);
    const result = await remove.run({ locale, postId: post.id });
    if (result.ok) await onChanged();
    else setFailure(result.error);
  }

  const types = limits.photoTypes.map((type) => type.replace("image/", "").toUpperCase()).join(", ");

  return (
    <Card data-testid="photo-panel">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- engine photo URLs come from many hosts (Pexels, uploads)
          <img src={image.url} alt={image.alt ?? ""} data-testid="photo-preview" className="aspect-[3/2] w-full rounded object-cover" />
        ) : (
          <p data-testid="photo-none" className="text-muted-foreground">
            {t("none")}
          </p>
        )}
        {post.platform === "instagram" && !image && (
          <p data-testid="photo-required" className="rounded bg-warn-bg px-2 py-1 text-warn-fg">
            {t("required")}
          </p>
        )}
        {post.photoIdea && <p className="text-muted-foreground">{t("suggested", { idea: post.photoIdea })}</p>}
        {editable && (
          <>
            <div className="flex flex-wrap gap-2">
              <PhotoPicker locale={locale} initialQuery={post.photoIdea ?? ""} disabled={busy} onPick={choose} />
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileInput.current?.click()} data-testid="photo-upload-button">
                {t("upload")}
              </Button>
              {image && (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void removePhoto()} data-testid="photo-remove">
                  {t("remove")}
                </Button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              accept={limits.photoTypes.join(",")}
              aria-label={t("upload")}
              data-testid="photo-upload"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("uploadHint", { types, size: megabytes(limits.photoMaxBytes) })}</p>
          </>
        )}
        {image && text && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="photo-alt">{t("alt")}</Label>
              <Input
                id="photo-alt"
                data-testid="photo-alt"
                value={text.alt ?? ""}
                disabled={!editable}
                onChange={(event) => onTextChange({ ...text, alt: event.target.value || null })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="photo-credit">{t("credit")}</Label>
              <Input
                id="photo-credit"
                data-testid="photo-credit"
                value={text.credit ?? ""}
                disabled={!editable}
                onChange={(event) => onTextChange({ ...text, credit: event.target.value || null })}
              />
            </div>
          </>
        )}
        {tooLarge && (
          <p role="alert" data-testid="photo-too-large" className="text-bad-fg">
            {tooLarge}
          </p>
        )}
        {error && <FieldError testId="field-image-error" message={error} />}
        {failure && <ActionError error={failure} />}
      </CardContent>
    </Card>
  );
}

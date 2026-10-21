"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { removeSeoPictureAction, uploadSeoPictureAction } from "@/app/[locale]/(app)/settings/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEngineAction, useEngineUpload } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";

type Props = { locale: string; picture: string | null; photoTypes: string[]; photoMaxBytes: number };

const megabytes = (bytes: number) => String(Math.round((bytes / 1_048_576) * 10) / 10);

/** Spec v1.1 §6 SEO "share image upload" (POST/DELETE …/settings/seo/picture). The engine checks the type; the size is checked here first. */
export function SharePicture({ locale, picture, photoTypes, photoMaxBytes }: Props) {
  const t = useTranslations("Settings.seo.picture");
  const upload = useEngineUpload(uploadSeoPictureAction);
  const remove = useEngineAction(removeSeoPictureAction);
  const [failure, setFailure] = useState<EngineFailure | null>(null);
  const [tooLarge, setTooLarge] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = upload.pending || remove.pending;
  const types = photoTypes.map((type) => type.replace("image/", "").toUpperCase()).join(", ");

  async function send(file: File) {
    setFailure(null);
    setTooLarge(null);
    if (file.size > photoMaxBytes) {
      setTooLarge(t("tooLarge", { size: megabytes(file.size), limit: megabytes(photoMaxBytes) }));
    } else {
      const result = await upload.run({ locale }, file);
      if (!result.ok) setFailure(result.error);
    }
    if (input.current) input.current.value = "";
  }

  async function removePicture() {
    setFailure(null);
    const result = await remove.run({ locale });
    if (!result.ok) setFailure(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint", { types, size: megabytes(photoMaxBytes) })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element -- the engine's media URL (a data: URL in the mock)
          <img src={picture} alt={t("preview")} data-testid="seo-picture-preview" className="max-h-40 w-auto self-start rounded-md border border-border" />
        ) : (
          <p data-testid="seo-picture-none" className="text-sm text-muted-foreground">
            {t("none")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} data-testid="seo-picture-upload-button" onClick={() => input.current?.click()}>
            {t("upload")}
          </Button>
          {picture && (
            <Button type="button" variant="outline" size="sm" disabled={busy} data-testid="seo-picture-remove" onClick={() => void removePicture()}>
              {t("remove")}
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          className="sr-only"
          accept={photoTypes.join(",")}
          aria-label={t("upload")}
          data-testid="seo-picture-upload"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
          }}
        />
        {(failure || tooLarge) && (
          <div data-testid="seo-picture-error">
            {tooLarge && <p className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">{tooLarge}</p>}
            {failure && <ActionError error={failure} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

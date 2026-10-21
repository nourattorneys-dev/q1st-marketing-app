"use client";

import { useTranslations } from "next-intl";
import { captionLength, captionOf } from "@/lib/posts/social";

type Props = { platform: string; language: string; content: string; hashtags: string[]; imageUrl: string | null };

/** How the post will read on its platform: the photo, the text and the hashtags, with a character count. */
export function SocialPreview({ platform, language, content, hashtags, imageUrl }: Props) {
  const t = useTranslations("Editor.preview");
  const tReview = useTranslations("Review");
  const caption = captionOf(content, hashtags);
  const length = captionLength(caption);
  const platformName = tReview.has(`platforms.${platform}`) ? tReview(`platforms.${platform}`) : platform;
  return (
    <section data-testid="social-preview" aria-label={t("title", { platform: platformName })} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm">
      <p className="font-medium">{t("title", { platform: platformName })}</p>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- engine photo URLs come from many hosts (Pexels, uploads)
        <img src={imageUrl} alt="" data-testid="social-preview-photo" className="aspect-square w-full rounded object-cover" />
      )}
      <p data-testid="social-preview-caption" lang={language} dir={language === "ar" ? "rtl" : "ltr"} className="whitespace-pre-wrap break-words">
        {caption || t("empty")}
      </p>
      <p data-testid="social-preview-count" className="text-xs text-muted-foreground">
        {t("count", { count: length, n: String(length) })}
      </p>
    </section>
  );
}

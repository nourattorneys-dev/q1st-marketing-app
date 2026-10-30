"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * P2b: how the article could look in search results, from its meta title and description as they are typed (the post's
 * title when no meta title is set). Long text is cut the way search pages cut it, so the writer sees what is lost.
 */
export function SearchPreview({ title, description, slug, language }: { title: string; description: string; slug: string; language: string }) {
  const t = useTranslations("Editor.searchPreview");
  const dir = language === "ar" ? "rtl" : "ltr";
  return (
    <Card data-testid="search-preview">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1 rounded-xl border border-border p-3.5" lang={language} dir={dir}>
          {slug && (
            <span className="truncate text-xs text-ok-fg" dir="ltr">
              /{slug}
            </span>
          )}
          <span className="line-clamp-1 text-[15px] font-medium text-[#1a0dab] dark:text-[#8ab4f8]">{title || t("noTitle")}</span>
          <span className="line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">{description || t("noDescription")}</span>
        </div>
      </CardContent>
    </Card>
  );
}

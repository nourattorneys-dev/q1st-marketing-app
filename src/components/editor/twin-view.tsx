"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { alignBlocks, blockSummaries, type BlockSummary } from "@/lib/editor/blocks";
import type { Post } from "@/lib/engine/schemas";
import { cn } from "@/lib/utils";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

type Props = { mineHtml: string; mineLanguage: string; twin: Post };

/** English always on the left, Arabic on the right, aligned section by section (design §7). */
export function TwinView({ mineHtml, mineLanguage, twin }: Props) {
  const t = useTranslations("Editor");
  const mineIsEnglish = mineLanguage !== "ar";
  const english = mineIsEnglish ? mineHtml : (twin.content ?? "");
  const arabic = mineIsEnglish ? (twin.content ?? "") : mineHtml;
  const rows = useMemo(() => alignBlocks(blockSummaries(english, parse), blockSummaries(arabic, parse)), [english, arabic]);
  const mismatches = rows.filter((row) => !row.matches).length;

  const summary =
    mismatches === 0
      ? t("structureMatches", { count: String(rows.length) })
      : mismatches === 1
        ? t("structureMismatchOne")
        : t("structureMismatchMany", { count: String(mismatches) });

  const cell = (block: BlockSummary | null, dir: "ltr" | "rtl", lang: string) => (
    <div dir={dir} lang={lang} className="min-w-0 rounded px-2 py-1">
      {block ? (
        <>
          <span className="me-2 font-mono text-xs text-muted-foreground">{block.tag}</span>
          {block.text}
        </>
      ) : (
        <span className="text-muted-foreground">{t("missingBlock")}</span>
      )}
    </div>
  );

  return (
    <section data-testid="twin-view" className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
      <p data-testid="twin-summary" className={cn("rounded px-2 py-1", mismatches === 0 ? "bg-ok-bg text-ok-fg" : "bg-bad-bg text-bad-fg")}>
        {summary}
      </p>
      <div className="grid grid-cols-2 gap-2 font-medium">
        <div data-testid="twin-left" dir="ltr" lang="en">
          {t("languages.en")}
        </div>
        <div data-testid="twin-right" dir="rtl" lang="ar">
          {t("languages.ar")}
        </div>
      </div>
      {rows.map((row, index) => (
        <div
          key={index}
          data-testid={row.matches ? "twin-row" : "twin-row-mismatch"}
          className={cn("grid grid-cols-2 gap-2", !row.matches && "bg-bad-bg text-bad-fg")}
        >
          {cell(row.left, "ltr", "en")}
          {cell(row.right, "rtl", "ar")}
        </div>
      ))}
    </section>
  );
}

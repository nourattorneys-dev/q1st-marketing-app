"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Post } from "@/lib/engine/schemas";
import { cn } from "@/lib/utils";

const LEVELS = ["critical", "warn", "human"] as const;
const STYLE = { critical: "bg-bad-bg text-bad-fg", warn: "bg-warn-bg text-warn-fg", human: "bg-neutral-bg text-neutral-fg" };

/** Findings exactly as the engine words them (spec §2 "show errors as text"); "human" items are never shown as passed. */
export function ChecksPanel({ post }: { post: Post }) {
  const t = useTranslations("Editor");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("checks")}</CardTitle>
        {post.seo && <CardDescription data-testid="seo-score">{t("seoScore", { score: String(post.seo.score) })}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {post.findings.length === 0 && <p className="text-muted-foreground">{t("noFindings")}</p>}
        {LEVELS.map((level) => {
          const items = post.findings.filter((finding) => finding.level === level);
          if (items.length === 0) return null;
          return (
            <section key={level} data-testid={`checks-${level}`}>
              <h3 className="mb-1 font-medium">{t(level)}</h3>
              {level === "human" && <p className="mb-1 text-xs text-muted-foreground">{t("humanHint")}</p>}
              <ul className="flex flex-col gap-1">
                {items.map((finding, index) => (
                  <li key={`${finding.code ?? finding.message}-${index}`} className={cn("rounded px-2 py-1", STYLE[level])}>
                    {finding.ref && <span className="me-1 font-mono text-xs">{finding.ref}</span>}
                    {finding.message}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

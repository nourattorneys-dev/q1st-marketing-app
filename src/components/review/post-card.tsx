"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { Post } from "@/lib/engine/schemas";
import { findingCounts } from "@/lib/posts/rules";

export function PostCard({ post, selected, onSelect }: { post: Post; selected: boolean; onSelect: (checked: boolean) => void }) {
  const t = useTranslations("Review");
  const counts = findingCounts(post);
  const selectable = post.actions.includes("approve") || post.actions.includes("publishNow");
  const languageName = (code: string) => (t.has(`languages.${code}`) ? t(`languages.${code}`) : code);

  return (
    <Card data-testid={`card-${post.id}`}>
      <CardHeader className="flex flex-row items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-primary"
          data-testid={`card-select-${post.id}`}
          aria-label={t("select", { title: post.title })}
          checked={selected}
          disabled={!selectable}
          onChange={(event) => onSelect(event.target.checked)}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <Link
            href={`/review/${post.id}`}
            data-testid={`card-title-${post.id}`}
            lang={post.language}
            dir={post.language === "ar" ? "rtl" : "ltr"}
            className="font-heading text-lg hover:underline"
          >
            {post.title}
          </Link>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">{t.has(`kinds.${post.kind}`) ? t(`kinds.${post.kind}`) : post.kind}</Badge>
            <Badge variant="outline">{languageName(post.language)}</Badge>
            {post.twin && (
              <Badge variant="outline" data-testid={`card-twin-${post.id}`}>
                {t("twin", { language: languageName(post.twin.language) })}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3 text-sm">
        {post.status === "drafting" ? (
          <span data-testid={`card-drafting-${post.id}`} className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-hidden="true" />
            {t("drafting")}
          </span>
        ) : (
          <>
            {counts.critical > 0 && (
              <span data-testid={`card-critical-${post.id}`} className="rounded bg-bad-bg px-2 py-0.5 text-bad-fg">
                {t("critical", { count: counts.critical, n: String(counts.critical) })}
              </span>
            )}
            {counts.warn > 0 && <span className="rounded bg-warn-bg px-2 py-0.5 text-warn-fg">{t("warn", { count: counts.warn, n: String(counts.warn) })}</span>}
          </>
        )}
        {post.image && (
          // eslint-disable-next-line @next/next/no-img-element -- engine photo URLs come from many hosts (Pexels, uploads)
          <img src={post.image.url} alt={post.image.alt ?? ""} className="ms-auto h-12 w-16 rounded object-cover" />
        )}
      </CardContent>
    </Card>
  );
}

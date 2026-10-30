"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Post } from "@/lib/engine/schemas";
import { findingCounts } from "@/lib/posts/rules";

const TAG = "rounded-full px-2 py-0.5 font-mono text-[11px]";

/** P2b: one post as a row of the Review list: pick it, see what it is and whether it passes its checks, open it. */
export function PostCard({ post, selected, onSelect }: { post: Post; selected: boolean; onSelect: (checked: boolean) => void }) {
  const t = useTranslations("Review");
  const counts = findingCounts(post);
  const selectable = post.actions.includes("approve") || post.actions.includes("publishNow");
  const languageName = (code: string) => (t.has(`languages.${code}`) ? t(`languages.${code}`) : code);

  return (
    <li
      data-testid={`card-${post.id}`}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-border px-5 py-4 transition-colors duration-200 first:border-t-0 hover:bg-background/60 md:grid-cols-[auto_minmax(0,1fr)_10rem_auto_auto]"
    >
      <input
        type="checkbox"
        className="size-[18px] accent-primary"
        data-testid={`card-select-${post.id}`}
        aria-label={t("select", { title: post.title })}
        checked={selected}
        disabled={!selectable}
        onChange={(event) => onSelect(event.target.checked)}
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <Link
          href={`/review/${post.id}`}
          data-testid={`card-title-${post.id}`}
          lang={post.language}
          dir={post.language === "ar" ? "rtl" : "ltr"}
          className="text-[15px] font-semibold hover:text-primary"
        >
          {post.title}
        </Link>
        <div className="flex flex-wrap gap-1.5">
          <span className={`${TAG} bg-muted text-foreground/80`}>{t.has(`kinds.${post.kind}`) ? t(`kinds.${post.kind}`) : post.kind}</span>
          <span className={`${TAG} bg-muted text-foreground/80`}>{languageName(post.language)}</span>
          {post.twin && (
            <span className={`${TAG} border border-dashed border-border text-muted-foreground`} data-testid={`card-twin-${post.id}`}>
              {t("twin", { language: languageName(post.twin.language) })}
            </span>
          )}
        </div>
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-2 text-[13px] md:col-start-auto">
        {post.status === "drafting" ? (
          <span data-testid={`card-drafting-${post.id}`} className="inline-flex items-center gap-2 text-muted-foreground">
            <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-hidden="true" />
            {t("drafting")}
          </span>
        ) : counts.critical > 0 || counts.warn > 0 ? (
          <>
            {counts.critical > 0 && (
              <span data-testid={`card-critical-${post.id}`} className="rounded-md bg-bad-bg px-2 py-0.5 font-medium text-bad-fg">
                {t("critical", { count: counts.critical, n: String(counts.critical) })}
              </span>
            )}
            {counts.warn > 0 && <span className="rounded-md bg-warn-bg px-2 py-0.5 text-warn-fg">{t("warn", { count: counts.warn, n: String(counts.warn) })}</span>}
          </>
        ) : (
          <span className="font-medium text-ok-fg">{t("ready")}</span>
        )}
      </div>
      {post.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- engine photo URLs come from many hosts (Pexels, uploads)
        <img src={post.image.url} alt={post.image.alt ?? ""} className="hidden h-11 w-16 rounded-lg object-cover md:block" />
      ) : (
        <span className="hidden md:block" />
      )}
      <Link
        href={`/review/${post.id}`}
        className="row-span-2 rounded-[10px] border border-border px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200 hover:bg-accent md:row-span-1"
        tabIndex={-1}
        aria-hidden="true"
      >
        {t("open")}
      </Link>
    </li>
  );
}

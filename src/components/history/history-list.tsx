import { getTranslations } from "next-intl/server";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { Pager } from "@/components/lists/pager";
import { SkippedNote } from "@/components/lists/skipped-note";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { pageCount, requestedPage } from "@/lib/lists/paging";
import { HistoryBoard, type HistoryEntry } from "./history-board";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Spec v1.1 §6 /history: published, failed and rejected posts, newest first, a page at a time. */
export async function HistoryList({ locale, searchParams }: Props) {
  await requirePermission(locale, "content.work");
  const page = requestedPage((await searchParams).page);
  const t = await getTranslations("History");
  const tLists = await getTranslations("Lists");
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  const [list, site] = await Promise.all([
    tryEngine(() =>
      engine.listPosts({
        statuses: ["published", "failed", "rejected"],
        page,
        pageSize: meta.ok ? meta.data.limits.pageSizeDefault : undefined,
        sort: "-updated_at",
      }),
    ),
    tryEngine(() => engine.siteTimezone()),
  ]);
  if (!list.ok) return <EngineNotice error={list.error} />;
  if (!site.ok) return <EngineNotice error={site.error} />;

  // The skipped note comes first, so a page whose items were all left out never reads as empty (Review Focus 4).
  if (list.data.posts.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <SkippedNote count={list.data.skipped} />
        {page === 1 && list.data.skipped === 0 && (
          <p data-testid="history-empty" className="text-muted-foreground">
            {t("empty")}
          </p>
        )}
        {page > 1 && (
          <p data-testid="list-page-empty" className="text-sm">
            {tLists("pageEmpty")}{" "}
            <Link href="/history" data-testid="list-first-page" className="text-primary underline">
              {tLists("firstPage")}
            </Link>
          </p>
        )}
      </div>
    );
  }

  const timeZone = site.data.timezone;
  const entries: HistoryEntry[] = list.data.posts.map((post) => ({
    id: post.id,
    title: post.title,
    language: post.language,
    status: post.status,
    platform: post.platform,
    target: post.published?.target ?? null,
    url: post.published?.url ?? null,
    publishedAt: post.published ? formatDateTime(post.published.at, { timeZone, locale }) : null,
    overrideReason: post.overrideReason ?? null,
    error: post.status === "failed" ? (post.error ?? null) : null,
    reviewNote: post.status === "rejected" ? (post.reviewNote ?? null) : null,
    actions: post.actions,
  }));

  return (
    <div className="flex flex-col gap-4">
      <SkippedNote count={list.data.skipped} />
      <HistoryBoard locale={locale} entries={entries} />
      <Pager pathname="/history" page={page} pages={pageCount(list.data.meta)} />
    </div>
  );
}

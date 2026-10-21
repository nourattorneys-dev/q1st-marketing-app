import { EngineNotice } from "@/components/dashboard/engine-notice";
import { Pager } from "@/components/lists/pager";
import { SkippedNote } from "@/components/lists/skipped-note";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { pageCount, requestedPage } from "@/lib/lists/paging";
import { ReviewBoard } from "./review-board";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function ReviewQueue({ locale, searchParams }: Props) {
  await requirePermission(locale, "content.work");
  const page = requestedPage((await searchParams).page);
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  const list = await tryEngine(() =>
    engine.listPosts({ statuses: ["drafting", "pending"], page, pageSize: meta.ok ? meta.data.limits.pageSizeDefault : undefined }),
  );
  if (!list.ok) return <EngineNotice error={list.error} />;
  return (
    <div className="flex flex-col gap-4">
      <SkippedNote count={list.data.skipped} />
      <ReviewBoard
        locale={locale}
        posts={list.data.posts}
        total={list.data.meta?.total ?? list.data.posts.length}
        pollSeconds={meta.ok ? meta.data.pollSeconds : 5}
      />
      <Pager pathname="/review" page={page} pages={pageCount(list.data.meta)} />
    </div>
  );
}

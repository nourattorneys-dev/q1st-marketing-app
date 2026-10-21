import { EngineNotice } from "@/components/dashboard/engine-notice";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { ReviewBoard } from "./review-board";

export async function ReviewQueue({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "content.work");
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  const list = await tryEngine(() =>
    engine.listPosts({ statuses: ["drafting", "pending"], pageSize: meta.ok ? meta.data.limits.pageSizeDefault : undefined }),
  );
  if (!list.ok) return <EngineNotice error={list.error} />;
  return (
    <ReviewBoard
      locale={locale}
      posts={list.data.posts}
      total={list.data.meta?.total ?? list.data.posts.length}
      pollSeconds={meta.ok ? meta.data.pollSeconds : 5}
    />
  );
}

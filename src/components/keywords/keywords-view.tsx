import { EngineNotice } from "@/components/dashboard/engine-notice";
import { Pager } from "@/components/lists/pager";
import { SkippedNote } from "@/components/lists/skipped-note";
import type { AppLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { keywordTab, tabStatuses } from "@/lib/keywords/tabs";
import { pageCount, requestedPage } from "@/lib/lists/paging";
import { AddKeywords } from "./add-keywords";
import { KeywordTabs } from "./keyword-tabs";
import { KeywordsBoard, type KeywordRow } from "./keywords-board";
import { ProposeKeywords } from "./propose-keywords";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Spec v1.1 §6 /keywords: add, propose, and the tab's table, a page at a time. */
export async function KeywordsView({ locale, searchParams }: Props) {
  const session = await requirePermission(locale, "content.work");
  const query = await searchParams;
  const tab = keywordTab(query.tab);
  const page = requestedPage(query.page);
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  const { languages, pollSeconds } = meta.data;
  const list = await tryEngine(() => engine.listKeywords({ statuses: tabStatuses(tab), page, pageSize: meta.data.limits.pageSizeDefault }));
  const canRequestUpgrade = can(session.role, "plan.manage");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <AddKeywords locale={locale} languages={languages} />
        <ProposeKeywords locale={locale} languages={languages} pollSeconds={pollSeconds} />
      </div>
      <KeywordTabs current={tab} />
      {list.ok ? (
        <>
          <SkippedNote count={list.data.skipped} />
          <KeywordsBoard
            key={tab}
            locale={locale}
            tab={tab}
            keywords={list.data.keywords.map(
              (keyword): KeywordRow => ({
                id: keyword.id,
                phrase: keyword.phrase,
                language: keyword.language,
                source: keyword.source,
                status: keyword.status,
                rationale: keyword.rationale ?? null,
                uses: keyword.uses ?? 0,
              }),
            )}
            languages={languages}
            pollSeconds={pollSeconds}
            canRequestUpgrade={canRequestUpgrade}
          />
          <Pager pathname="/keywords" page={page} pages={pageCount(list.data.meta)} query={{ tab }} />
        </>
      ) : (
        <EngineNotice error={list.error} />
      )}
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import { Pager } from "@/components/lists/pager";
import { SkippedNote } from "@/components/lists/skipped-note";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { pageCount, requestedPage } from "@/lib/lists/paging";
import { findingTab, tabStatuses } from "@/lib/site-health/findings";
import { FindingTabs, findingTabHref } from "./finding-tabs";
import { FindingsBoard } from "./findings-board";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Spec v1.1 §6 /site-health: findings by tab, a page at a time. Both roles see it; only an Admin can apply a fix (design §5). */
export async function SiteHealthView({ locale, searchParams }: Props) {
  const session = await requirePermission(locale, "siteHealth.view");
  const query = await searchParams;
  const tab = findingTab(query.tab);
  const page = requestedPage(query.page);
  const tLists = await getTranslations("Lists");
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  const list = await tryEngine(() => engine.listFindings({ statuses: tabStatuses(tab), page, pageSize: meta.data.limits.pageSizeDefault }));

  return (
    <div className="flex flex-col gap-4">
      <FindingTabs current={tab} />
      {!list.ok ? (
        <EngineNotice error={list.error} />
      ) : (
        <>
          <SkippedNote count={list.data.skipped} />
          {page > 1 && list.data.findings.length === 0 ? (
            <p data-testid="list-page-empty" className="text-sm">
              {tLists("pageEmpty")}{" "}
              <Link href={findingTabHref(tab)} data-testid="list-first-page" className="text-primary underline">
                {tLists("firstPage")}
              </Link>
            </p>
          ) : (
            <FindingsBoard
              locale={locale}
              findings={list.data.findings}
              pollSeconds={meta.data.pollSeconds}
              canApply={can(session.role, "siteHealth.apply")}
              canRequestUpgrade={can(session.role, "plan.manage")}
            />
          )}
          <Pager pathname="/site-health" page={page} pages={pageCount(list.data.meta)} query={tab === "todo" ? {} : { tab }} />
        </>
      )}
    </div>
  );
}

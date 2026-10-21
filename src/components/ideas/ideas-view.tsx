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
import { IdeasBoard } from "./ideas-board";
import { NewRequestForm } from "./new-request-form";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Spec v1.1 §6 /suggestions: the new-request form and the topic cards, a page at a time (dismissed ideas are left out). */
export async function IdeasView({ locale, searchParams }: Props) {
  const session = await requirePermission(locale, "content.work");
  const page = requestedPage((await searchParams).page);
  const tLists = await getTranslations("Lists");
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  const list = await tryEngine(() =>
    engine.listSuggestions({ statuses: ["new", "drafting", "drafted"], page, pageSize: meta.data.limits.pageSizeDefault }),
  );
  const canRequestUpgrade = can(session.role, "plan.manage");
  const { languages, kinds, platforms, pollSeconds } = meta.data;

  return (
    <div className="flex flex-col gap-6">
      <NewRequestForm locale={locale} kinds={kinds} platforms={platforms} languages={languages} pollSeconds={pollSeconds} canRequestUpgrade={canRequestUpgrade} />
      {!list.ok ? (
        <EngineNotice error={list.error} />
      ) : page > 1 && list.data.suggestions.length === 0 ? (
        <div className="flex flex-col gap-4">
          <SkippedNote count={list.data.skipped} />
          <p data-testid="list-page-empty" className="text-sm">
            {tLists("pageEmpty")}{" "}
            <Link href="/ideas" data-testid="list-first-page" className="text-primary underline">
              {tLists("firstPage")}
            </Link>
          </p>
        </div>
      ) : (
        <>
          <SkippedNote count={list.data.skipped} />
          <IdeasBoard locale={locale} ideas={list.data.suggestions} languages={languages} pollSeconds={pollSeconds} canRequestUpgrade={canRequestUpgrade} />
          <Pager pathname="/ideas" page={page} pages={pageCount(list.data.meta)} />
        </>
      )}
    </div>
  );
}

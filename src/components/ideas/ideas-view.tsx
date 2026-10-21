import { EngineNotice } from "@/components/dashboard/engine-notice";
import { SkippedNote } from "@/components/lists/skipped-note";
import type { AppLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { IdeasBoard } from "./ideas-board";
import { NewRequestForm } from "./new-request-form";

/** Spec v1.1 §6 /suggestions: the new-request form and the topic cards (dismissed ideas are left out). */
export async function IdeasView({ locale }: { locale: AppLocale }) {
  const session = await requirePermission(locale, "content.work");
  const engine = await getEngine();
  const meta = await tryEngine(() => engine.meta());
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  const list = await tryEngine(() => engine.listSuggestions({ statuses: ["new", "drafting", "drafted"] }));
  const canRequestUpgrade = can(session.role, "plan.manage");
  const { languages, kinds, platforms, pollSeconds } = meta.data;

  return (
    <div className="flex flex-col gap-6">
      <NewRequestForm locale={locale} kinds={kinds} platforms={platforms} languages={languages} pollSeconds={pollSeconds} canRequestUpgrade={canRequestUpgrade} />
      {list.ok ? (
        <>
          <SkippedNote count={list.data.skipped} />
          <IdeasBoard locale={locale} ideas={list.data.suggestions} languages={languages} pollSeconds={pollSeconds} canRequestUpgrade={canRequestUpgrade} />
        </>
      ) : (
        <EngineNotice error={list.error} />
      )}
    </div>
  );
}

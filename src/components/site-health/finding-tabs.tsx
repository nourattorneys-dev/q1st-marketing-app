import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { FINDING_TAB_KEYS, type FindingTab } from "@/lib/site-health/findings";
import { cn } from "@/lib/utils";

export const findingTabHref = (tab: FindingTab) => (tab === "todo" ? "/site-health" : `/site-health?tab=${tab}`);

export async function FindingTabs({ current }: { current: FindingTab }) {
  const t = await getTranslations("SiteHealth.tabs");
  return (
    <nav aria-label={t("label")} className="flex flex-wrap gap-2 border-b border-border pb-2">
      {FINDING_TAB_KEYS.map((tab) => (
        <Link
          key={tab}
          href={findingTabHref(tab)}
          data-testid={`finding-tab-${tab}`}
          aria-current={tab === current ? "page" : undefined}
          className={cn("rounded-md px-3 py-1.5 text-sm hover:bg-muted", tab === current && "bg-muted font-medium")}
        >
          {t(tab)}
        </Link>
      ))}
    </nav>
  );
}

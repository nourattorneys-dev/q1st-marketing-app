import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { KEYWORD_TABS, type KeywordTab } from "@/lib/keywords/tabs";
import { cn } from "@/lib/utils";

export async function KeywordTabs({ current }: { current: KeywordTab }) {
  const t = await getTranslations("Keywords.tabs");
  return (
    <nav aria-label={t("label")} className="flex flex-wrap gap-2 border-b border-border">
      {KEYWORD_TABS.map((tab) => (
        <Link
          key={tab}
          href={{ pathname: "/keywords", query: { tab } }}
          data-testid={`keyword-tab-${tab}`}
          aria-current={tab === current ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm",
            tab === current ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t(tab)}
        </Link>
      ))}
    </nav>
  );
}

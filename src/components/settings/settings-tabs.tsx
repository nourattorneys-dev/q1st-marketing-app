import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export const SETTINGS_PAGES = ["seo", "schedule", "website", "social", "webhook"] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

/** Design §7: one page per settings model. Each page says which one it is, so nothing here reads the pathname. */
export async function SettingsTabs({ current }: { current: SettingsPage }) {
  const t = await getTranslations("Settings.tabs");
  return (
    <nav aria-label={t("label")} className="flex flex-wrap gap-2 border-b border-border pb-2">
      {SETTINGS_PAGES.map((page) => (
        <Link
          key={page}
          href={`/settings/${page}`}
          data-testid={`settings-tab-${page}`}
          aria-current={page === current ? "page" : undefined}
          className={cn("rounded-md px-3 py-1.5 text-sm hover:bg-muted", page === current && "bg-muted font-medium")}
        >
          {t(page)}
        </Link>
      ))}
    </nav>
  );
}

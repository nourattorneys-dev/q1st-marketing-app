import { getTranslations } from "next-intl/server";
import { getCurrentSite } from "@/lib/tenancy";
import { SiteSelect } from "./site-select";

/** P1b: the site being worked on. A choice for anyone who may open more than one site; just its name otherwise. */
export async function SiteSwitcher({ locale }: { locale: string }) {
  const current = await getCurrentSite();
  if (!current) return null;
  const t = await getTranslations("Shell.site");
  if (current.sites.length < 2) {
    return (
      <span data-testid="site-name" className="me-auto truncate text-sm font-medium" title={t("label")}>
        {current.site.name}
      </span>
    );
  }
  return <SiteSelect locale={locale} label={t("label")} failed={t("failed")} current={current.site.id} sites={current.sites} />;
}

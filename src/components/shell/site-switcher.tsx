import { getTranslations } from "next-intl/server";
import { getCurrentSite } from "@/lib/tenancy";
import { SiteSelect } from "./site-select";

/** P1b: the site being worked on. A choice for anyone who may open more than one site; just its name otherwise. */
export async function SiteSwitcher({ locale }: { locale: string }) {
  const current = await getCurrentSite();
  if (!current) return null;
  const t = await getTranslations("Shell.site");
  // The client first, then the site being worked on: someone who works for several clients always sees which one this is.
  return (
    <div className="me-auto flex min-w-0 basis-full items-center gap-2 text-sm md:basis-auto">
      <span data-testid="client-name" className="truncate text-muted-foreground" title={t("client")}>
        {current.client.name}
      </span>
      <span aria-hidden="true" className="text-muted-foreground/60">/</span>
      {current.sites.length < 2 ? (
        <span data-testid="site-name" className="truncate font-medium" title={t("label")}>
          {current.site.name}
        </span>
      ) : (
        <SiteSelect locale={locale} label={t("label")} failed={t("failed")} current={current.site.id} sites={current.sites} />
      )}
    </div>
  );
}

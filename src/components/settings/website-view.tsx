import { EngineNotice } from "@/components/dashboard/engine-notice";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { WebsiteSettingsForm } from "./website-settings-form";

export async function WebsiteView({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "settings.manage");
  const engine = await getEngine();
  const [meta, website, site] = await Promise.all([
    tryEngine(() => engine.meta()),
    tryEngine(() => engine.websiteSettings()),
    tryEngine(() => engine.siteTimezone()),
  ]);
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  if (!website.ok) return <EngineNotice error={website.error} />;
  const checkedAt = website.data.lastCheckedAt;
  const lastChecked = checkedAt ? formatDateTime(checkedAt, { timeZone: site.ok ? site.data.timezone : "UTC", locale }) : null;
  return <WebsiteSettingsForm locale={locale} saved={website.data} types={meta.data.targetTypes} lastChecked={lastChecked} />;
}

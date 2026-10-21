import { EngineNotice } from "@/components/dashboard/engine-notice";
import type { AppLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { SeoSettingsForm } from "./seo-settings-form";
import { SharePicture } from "./share-picture";

export async function SeoView({ locale }: { locale: AppLocale }) {
  const session = await requirePermission(locale, "settings.manage");
  const engine = await getEngine();
  const [seo, meta] = await Promise.all([tryEngine(() => engine.seoSettings()), tryEngine(() => engine.meta())]);
  if (!seo.ok) return <EngineNotice error={seo.error} />;
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  return (
    <div className="flex flex-col gap-6">
      <SeoSettingsForm
        locale={locale}
        settings={seo.data}
        languages={meta.data.languages}
        pollSeconds={meta.data.pollSeconds}
        canRequestUpgrade={can(session.role, "plan.manage")}
      />
      <SharePicture
        locale={locale}
        picture={seo.data.ogImageUploaded?.url ?? null}
        photoTypes={meta.data.limits.photoTypes}
        photoMaxBytes={meta.data.limits.photoMaxBytes}
      />
    </div>
  );
}

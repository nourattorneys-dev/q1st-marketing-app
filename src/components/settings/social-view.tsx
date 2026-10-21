import { EngineNotice } from "@/components/dashboard/engine-notice";
import { SkippedNote } from "@/components/lists/skipped-note";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { connectedRow, socialRows } from "@/lib/settings/social";
import { SocialBoard } from "./social-board";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Social accounts from GET …/settings/social; Search Console's status comes from the site's connections (spec v1.1 §4). */
export async function SocialView({ locale, searchParams }: Props) {
  await requirePermission(locale, "settings.manage");
  const query = await searchParams;
  const engine = await getEngine();
  const [meta, social, connections, site] = await Promise.all([
    tryEngine(() => engine.meta()),
    tryEngine(() => engine.socialConnections()),
    tryEngine(() => engine.siteConnections()),
    tryEngine(() => engine.siteTimezone()),
  ]);
  if (!meta.ok) return <EngineNotice error={meta.error} />;
  if (!social.ok) return <EngineNotice error={social.error} />;
  const timeZone = site.ok ? site.data.timezone : "UTC";
  const rows = socialRows(social.data.connections, meta.data.features, connections.ok ? connections.data.connections.searchConsole : null).map((row) => ({
    ...row,
    expires: row.expiresAt ? formatDateTime(row.expiresAt, { timeZone, locale }) : null,
  }));
  return (
    <div className="flex flex-col gap-4">
      <SkippedNote count={social.data.skipped} />
      <SocialBoard locale={locale} rows={rows} connected={connectedRow(query.connected, rows)} />
    </div>
  );
}

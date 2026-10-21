import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { connectionWarnings, settingsPageFor } from "@/lib/dashboard/connections";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { EngineNotice } from "./engine-notice";

export async function ConnectionWarnings({ locale }: { locale: AppLocale }) {
  const session = await requireSession(locale);
  const admin = can(session.role, "settings.manage");
  const t = await getTranslations("Dashboard.connections");
  const engine = await getEngine();
  const site = await tryEngine(() => engine.siteConnections());
  // Spec v1.1 §6 first-run setup: with no website connection yet, the admin is sent to set it up (then on to social accounts).
  if (admin && site.ok && site.data.connections.website.status === "missing") redirect(`/${locale}/settings/website`);

  let body;
  if (!site.ok) body = <EngineNotice error={site.error} />;
  else {
    const warnings = connectionWarnings(site.data.connections);
    body =
      warnings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("allGood")}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {warnings.map(({ key, status }) => (
              <li
                key={key}
                data-testid={`connection-${key}`}
                data-status={status}
                className="flex items-center justify-between gap-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg"
              >
                <span>{t(`names.${key}`)}</span>
                <span className="flex items-center gap-3">
                  <span>{t.has(`statuses.${status}`) ? t(`statuses.${status}`) : status}</span>
                  {admin && (
                    <Link href={settingsPageFor(key)} data-testid={`connection-fix-${key}`} className="font-medium underline">
                      {t("fix")}
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground" data-testid="connections-help">
            {admin ? t("fixInSettings") : t("askAdmin")}
          </p>
        </>
      );
  }

  return (
    <Card data-testid="connections">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

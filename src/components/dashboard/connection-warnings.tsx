import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AlertCircle, CheckSquare, Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { connectionWarnings, settingsPageFor } from "@/lib/dashboard/connections";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { cn } from "@/lib/utils";
import { EngineNotice } from "./engine-notice";

function Row({ tone, icon, title, action, testId, status }: { tone: "info" | "bad" | "warn"; icon: ReactNode; title: ReactNode; action?: ReactNode; testId?: string; status?: string }) {
  return (
    <li data-testid={testId} data-status={status} className="flex items-center gap-3.5 border-t border-border py-3.5 first:border-t-0 first:pt-0">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
          tone === "info" && "bg-accent text-accent-foreground",
          tone === "bad" && "bg-bad-bg text-bad-fg",
          tone === "warn" && "bg-warn-bg text-warn-fg",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">{title}</span>
      {action}
    </li>
  );
}

const ACTION = "rounded-[10px] border border-border px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-200 hover:bg-accent";

/**
 * P2b "Needs your attention": what is waiting for review, what failed to publish, and every connection that needs
 * fixing, each with its next step. Spec v1.1 §6 first-run setup still applies: with no website connection yet, an Admin
 * is sent to set it up.
 */
export async function ConnectionWarnings({ locale }: { locale: AppLocale }) {
  const session = await requireSession(locale);
  const admin = can(session.role, "settings.manage");
  const t = await getTranslations("Dashboard");
  const engine = await getEngine();
  const [site, counts] = await Promise.all([tryEngine(() => engine.siteConnections()), tryEngine(() => engine.siteCounts())]);
  if (admin && site.ok && site.data.connections.website.status === "missing") redirect(`/${locale}/settings/website`);

  const pending = counts.ok ? counts.data.counts.pending : 0;
  const failed = counts.ok ? counts.data.counts.failed : 0;
  const warnings = site.ok ? connectionWarnings(site.data.connections) : [];
  const nothing = site.ok && pending === 0 && failed === 0 && warnings.length === 0;

  return (
    <Card data-testid="connections">
      <CardHeader>
        <CardTitle>{t("attention.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {nothing ? (
          <p className="text-sm text-muted-foreground">{t("attention.clear")}</p>
        ) : (
          <ul className="flex flex-col">
            {pending > 0 && (
              <Row
                tone="info"
                icon={<CheckSquare aria-hidden="true" className="size-[18px]" />}
                title={t("attention.pending", { count: pending })}
                action={<Link href="/review" className={ACTION}>{t("attention.review")}</Link>}
              />
            )}
            {failed > 0 && (
              <Row
                tone="bad"
                icon={<AlertCircle aria-hidden="true" className="size-[18px]" />}
                title={t("attention.failed", { count: failed })}
                action={<Link href="/history" className={ACTION}>{t("attention.see")}</Link>}
              />
            )}
            {warnings.map(({ key, status }) => (
              <Row
                key={key}
                testId={`connection-${key}`}
                status={status}
                tone="warn"
                icon={<Link2 aria-hidden="true" className="size-[18px]" />}
                title={
                  <>
                    {t(`connections.names.${key}`)}{" "}
                    <span className="font-normal text-muted-foreground">· {t.has(`connections.statuses.${status}`) ? t(`connections.statuses.${status}`) : status}</span>
                  </>
                }
                action={
                  admin ? (
                    <Link href={settingsPageFor(key)} data-testid={`connection-fix-${key}`} className={ACTION}>
                      {t("connections.fix")}
                    </Link>
                  ) : undefined
                }
              />
            ))}
          </ul>
        )}
        {!site.ok && <EngineNotice error={site.error} />}
        {warnings.length > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="connections-help">
            {admin ? t("connections.fixInSettings") : t("connections.askAdmin")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

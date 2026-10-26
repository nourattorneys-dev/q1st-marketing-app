import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { can } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { servicesEnv } from "@/lib/services-env";
import { EmailToggle } from "./email-toggle";
import { TestEmailButton } from "./test-email-button";

/** What this person gets by email (design §10), and their switch for it (design §4 preferences). */
export async function NotificationsView({ locale }: { locale: AppLocale }) {
  // Request-time on purpose: a view that reads only cookies isn't redrawn by the action's refresh() after in-app
  // navigation (Next 16.4); every other view calls getEngine(), which does the same.
  await connection();
  const session = await requireSession(locale);
  const t = await getTranslations("Notifications");
  const enabled = !(await getStore().emailOffUsers()).has(session.userId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
        <CardDescription>{t(`what.${session.role}`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <EmailToggle locale={locale} enabled={enabled} />
        {servicesEnv().emailMode === "log" && (
          <p data-testid="notifications-log-mode" className="text-muted-foreground">
            {t("logMode")}
          </p>
        )}
        {can(session.role, "settings.manage") && <TestEmailButton locale={locale} />}
      </CardContent>
    </Card>
  );
}

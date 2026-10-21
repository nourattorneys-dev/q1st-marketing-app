import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { SignOutControl } from "@/components/shell/sign-out-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { enableMockTwoFactor } from "@/lib/auth/mock-actions";
import { getSession } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { ClerkSecurity } from "./clerk-security";

/**
 * Design §5, §11: two-factor login is required for the Admin (this is the only page they reach until it's on) and
 * recommended for Reviewers. Call only under <Suspense>.
 */
export async function SecurityView({ locale }: { locale: AppLocale }) {
  const session = await getSession();
  if (!session) redirect(`/${locale}/sign-in`);
  if (!session.role) redirect(`/${locale}/no-access`);
  const t = await getTranslations("Security");
  const status = session.twoFactor ? "on" : session.role === "admin" ? "required" : "recommended";
  const clerk = serverEnv().authMode === "clerk";

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
        <CardDescription data-testid="security-status" data-status={status}>
          {t(status)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {clerk && <ClerkSecurity />}
        {!clerk && !session.twoFactor && (
          <form action={enableMockTwoFactor} className="flex flex-col gap-2">
            <input type="hidden" name="locale" value={locale} />
            <p className="text-sm text-muted-foreground">{t("testNotice")}</p>
            <div>
              <Button type="submit" data-testid="security-enable">
                {t("enableTest")}
              </Button>
            </div>
          </form>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {/* With Clerk the page can't tell when the Admin has just turned it on; the dashboard checks again. */}
          {(status !== "required" || clerk) && (
            <Link href="/" data-testid="security-continue" className="text-sm font-medium text-primary underline">
              {status === "required" ? t("continueOnceOn") : t("continue")}
            </Link>
          )}
          <SignOutControl locale={locale} />
        </div>
      </CardContent>
    </Card>
  );
}

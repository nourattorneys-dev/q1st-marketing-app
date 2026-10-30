import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { SignOutControl } from "@/components/shell/sign-out-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { enableMockTwoFactor } from "@/lib/auth/mock-actions";
import { getSession, getTwoFactorPolicy } from "@/lib/auth/session";
import { twoFactorStatus } from "@/lib/auth/two-factor";
import { serverEnv } from "@/lib/env";
import { ChangePasswordForm } from "./change-password-form";

/**
 * Design §5, §11: two-factor login is required for the Admin (this is the only page they reach until it's on) and
 * recommended for Reviewers. With TWO_FACTOR=off it's just the account page. Call only under <Suspense>.
 */
export async function SecurityView({ locale }: { locale: AppLocale }) {
  const session = await getSession();
  if (!session) redirect(`/${locale}/sign-in`);
  if (!session.role) redirect(`/${locale}/no-access?why=role`);
  if (serverEnv().authMode === "password") {
    const tAccount = await getTranslations("Account");
    const tRole = await getTranslations("Shell.role");
    const tSecurity = await getTranslations("Security");
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{tAccount("title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <dl data-testid="account-details" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{tAccount("name")}</dt>
            <dd>{session.name}</dd>
            <dt className="text-muted-foreground">{tAccount("email")}</dt>
            <dd>
              <bdi>{session.email}</bdi>
            </dd>
            <dt className="text-muted-foreground">{tAccount("role")}</dt>
            <dd>{tRole(session.role)}</dd>
          </dl>
          <ChangePasswordForm locale={locale} />
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" data-testid="security-continue" className="text-sm font-medium text-primary underline">
              {tSecurity("continue")}
            </Link>
            <SignOutControl locale={locale} />
          </div>
        </CardContent>
      </Card>
    );
  }
  const t = await getTranslations("Security");
  const status = twoFactorStatus(await getTwoFactorPolicy(), session);

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
        {status && (
          <CardDescription data-testid="security-status" data-status={status}>
            {t(status)}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {(status === "required" || status === "recommended") && (
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
          {status !== "required" && (
            <Link href="/" data-testid="security-continue" className="text-sm font-medium text-primary underline">
              {t("continue")}
            </Link>
          )}
          <SignOutControl locale={locale} />
        </div>
      </CardContent>
    </Card>
  );
}

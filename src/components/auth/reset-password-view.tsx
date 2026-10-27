import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { resetLinkValid } from "@/lib/accounts/resets";
import { getAccountStore } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { linkToken } from "./link-token";
import { ResetPasswordForm } from "./reset-password-form";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Spec M5c: a reset link lands here. An unknown, used or expired link sends the person to ask again. Call only under <Suspense>. */
export async function ResetPasswordView({ locale, searchParams }: Props) {
  await connection();
  if (serverEnv().authMode !== "password") notFound();
  const t = await getTranslations("ResetPassword");
  const token = linkToken((await searchParams).token);
  const valid = token !== "" && (await resetLinkValid(getAccountStore(), token, new Date()));
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {valid ? (
          <ResetPasswordForm locale={locale} token={token} />
        ) : (
          <>
            <p role="alert" data-testid="reset-invalid">
              {t("invalid")}
            </p>
            <Link href="/forgot-password" className="font-medium text-primary underline">
              {t("askAgain")}
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

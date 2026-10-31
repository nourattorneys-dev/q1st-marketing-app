import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth/auth-page";
import { SignOutControl } from "@/components/shell/sign-out-control";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asAppLocale } from "@/i18n/locales";

/**
 * Why this person can't work: no role yet, no website to open, their client is paused or closed (P1c), or this
 * address is a client they don't work for.
 */
const REASONS = ["role", "site", "suspended", "closed", "client"] as const;
type Reason = (typeof REASONS)[number];

async function Notice({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const why = (await searchParams).why;
  const reason: Reason = REASONS.find((known) => known === why) ?? "role";
  const t = await getTranslations("NoAccess");
  return (
    <CardHeader>
      <CardTitle className="font-heading text-2xl">{t(`${reason}.title`)}</CardTitle>
      <CardDescription>{t(`${reason}.body`)}</CardDescription>
    </CardHeader>
  );
}

export default async function NoAccessPage({ params, searchParams }: PageProps<"/[locale]/no-access">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);

  return (
    <AuthPage>
      <Card className="w-full max-w-md">
        <Suspense fallback={<CardHeader className="min-h-24" />}>
          <Notice searchParams={searchParams} />
        </Suspense>
        <CardContent>
          <SignOutControl locale={locale} />
        </CardContent>
      </Card>
    </AuthPage>
  );
}

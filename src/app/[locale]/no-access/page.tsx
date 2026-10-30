import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { LocaleSwitch } from "@/components/shell/locale-switch";
import { SignOutControl } from "@/components/shell/sign-out-control";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asAppLocale } from "@/i18n/locales";

/** Why this person can't work: no role yet, no website to open, or their client is paused or closed (P1c). */
const REASONS = ["role", "site", "suspended", "closed"] as const;
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
    <main className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="absolute end-4 top-4 flex gap-2">
        <ThemeToggle />
        <LocaleSwitch />
      </div>
      <Card className="w-full max-w-md animate-in fade-in-0 duration-300">
        <Suspense fallback={<CardHeader className="min-h-24" />}>
          <Notice searchParams={searchParams} />
        </Suspense>
        <CardContent>
          <SignOutControl locale={locale} />
        </CardContent>
      </Card>
    </main>
  );
}

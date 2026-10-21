import { getTranslations, setRequestLocale } from "next-intl/server";
import { LocaleSwitch } from "@/components/shell/locale-switch";
import { SignOutControl } from "@/components/shell/sign-out-control";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asAppLocale } from "@/i18n/locales";

export default async function NoAccessPage({ params }: PageProps<"/[locale]/no-access">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("NoAccess");

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="absolute end-4 top-4 flex gap-2">
        <ThemeToggle />
        <LocaleSwitch />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
          <CardDescription>{t("body")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutControl locale={locale} />
        </CardContent>
      </Card>
    </main>
  );
}

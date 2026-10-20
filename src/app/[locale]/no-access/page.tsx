import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignOutControl } from "@/components/shell/sign-out-control";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asAppLocale } from "@/i18n/locales";

export default async function NoAccessPage({ params }: PageProps<"/[locale]/no-access">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("NoAccess");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
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

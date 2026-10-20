import { getTranslations, setRequestLocale } from "next-intl/server";
import { asAppLocale } from "@/i18n/locales";

export default async function DashboardPage({ params }: PageProps<"/[locale]">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Dashboard");
  return <h1 className="text-3xl">{t("title")}</h1>;
}

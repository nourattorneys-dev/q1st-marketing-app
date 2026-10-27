import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AuthPage } from "@/components/auth/auth-page";
import { ResetPasswordView } from "@/components/auth/reset-password-view";
import { asAppLocale } from "@/i18n/locales";

/** searchParams is request data: passed down and awaited inside the Suspense boundary (Cache Components). */
export default async function ResetPasswordPage({ params, searchParams }: PageProps<"/[locale]/reset-password">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <AuthPage>
      <Suspense fallback={null}>
        <ResetPasswordView locale={locale} searchParams={searchParams} />
      </Suspense>
    </AuthPage>
  );
}

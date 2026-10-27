import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AuthPage } from "@/components/auth/auth-page";
import { ForgotPasswordView } from "@/components/auth/forgot-password-view";
import { asAppLocale } from "@/i18n/locales";

export default async function ForgotPasswordPage({ params }: PageProps<"/[locale]/forgot-password">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <AuthPage>
      <Suspense fallback={null}>
        <ForgotPasswordView />
      </Suspense>
    </AuthPage>
  );
}

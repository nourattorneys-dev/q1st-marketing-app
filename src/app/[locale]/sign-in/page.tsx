import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AuthPage } from "@/components/auth/auth-page";
import { SignInView } from "@/components/auth/sign-in-view";
import { asAppLocale } from "@/i18n/locales";

export default async function SignInPage({ params }: PageProps<"/[locale]/sign-in">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <AuthPage>
      <Suspense fallback={null}>
        <SignInView locale={locale} />
      </Suspense>
    </AuthPage>
  );
}

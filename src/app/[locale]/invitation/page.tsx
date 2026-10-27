import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { AuthPage } from "@/components/auth/auth-page";
import { InvitationView } from "@/components/auth/invitation-view";
import { asAppLocale } from "@/i18n/locales";

/** searchParams is request data: passed down and awaited inside the Suspense boundary (Cache Components). */
export default async function InvitationPage({ params, searchParams }: PageProps<"/[locale]/invitation">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <AuthPage>
      <Suspense fallback={null}>
        <InvitationView locale={locale} searchParams={searchParams} />
      </Suspense>
    </AuthPage>
  );
}

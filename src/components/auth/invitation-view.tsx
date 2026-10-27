import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { lookUpInvitation } from "@/lib/accounts/invitations";
import { getAccountStore } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { AcceptInvitationForm } from "./accept-invitation-form";
import { linkToken } from "./link-token";

type Props = { locale: AppLocale; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Spec M5c: an invitation link lands here. An unknown, used or expired link says so. Call only under <Suspense>. */
export async function InvitationView({ locale, searchParams }: Props) {
  await connection();
  if (serverEnv().authMode !== "password") notFound();
  const t = await getTranslations("Invitation");
  const token = linkToken((await searchParams).token);
  const found = token ? await lookUpInvitation(getAccountStore(), token, new Date()) : ({ state: "invalid" } as const);

  if (found.state !== "valid") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p role="alert" data-testid="invitation-problem" data-problem={found.state}>
            {t(found.state)}
          </p>
          <Link href="/sign-in" className="font-medium text-primary underline">
            {t("goToSignIn")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  const tRole = await getTranslations("Shell.role");
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
        <CardDescription data-testid="invitation-intro">{t("intro", { role: tRole(found.invitation.role) })}</CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInvitationForm locale={locale} token={token} email={found.invitation.email} />
      </CardContent>
    </Card>
  );
}

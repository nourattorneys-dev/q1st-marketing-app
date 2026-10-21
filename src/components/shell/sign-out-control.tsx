import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/locales";
import { serverEnv } from "@/lib/env";
import { ClerkSignOut } from "./clerk-sign-out";

/** Both modes end in a full page load of sign-in (M1 follow-up). Account settings are on /security. */
export async function SignOutControl({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Shell");
  if (serverEnv().authMode === "clerk") return <ClerkSignOut locale={locale} label={t("signOut")} />;
  return (
    // A plain form POST, not a server action, so the browser loads the sign-in page itself.
    <form method="post" action="/api/auth/sign-out">
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="ghost" size="sm" data-testid="sign-out">
        {t("signOut")}
      </Button>
    </form>
  );
}

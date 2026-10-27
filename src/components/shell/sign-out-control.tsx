import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/locales";

/** Both modes: a plain form POST, not a server action, so the browser loads the sign-in page itself (M1 follow-up). */
export async function SignOutControl({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Shell");
  return (
    <form method="post" action="/api/auth/sign-out">
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="ghost" size="sm" data-testid="sign-out">
        {t("signOut")}
      </Button>
    </form>
  );
}

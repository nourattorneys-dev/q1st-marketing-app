import { UserButton } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/locales";
import { signOutMockUser } from "@/lib/auth/mock-actions";
import { serverEnv } from "@/lib/env";

export async function SignOutControl({ locale }: { locale: AppLocale }) {
  if (serverEnv().authMode === "clerk") return <UserButton />;
  const t = await getTranslations("Shell");
  return (
    <form action={signOutMockUser}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="ghost" size="sm" data-testid="sign-out">
        {t("signOut")}
      </Button>
    </form>
  );
}

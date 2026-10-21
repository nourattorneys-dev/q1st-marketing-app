import { getTranslations, setRequestLocale } from "next-intl/server";
import { LocaleSwitch } from "@/components/shell/locale-switch";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { asAppLocale } from "@/i18n/locales";
import { signInAsMockUser } from "@/lib/auth/mock-actions";
import { MOCK_USERS } from "@/lib/auth/mock-session";
import { serverEnv } from "@/lib/env";
import { ClerkSignIn } from "./clerk-sign-in";

export default async function SignInPage({ params }: PageProps<"/[locale]/sign-in">) {
  const locale = asAppLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("SignIn");

  return (
    <main className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="absolute end-4 top-4 flex gap-2">
        <ThemeToggle />
        <LocaleSwitch />
      </div>
      {serverEnv().authMode === "clerk" ? (
        <ClerkSignIn />
      ) : (
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
            <CardDescription>{t("devNotice")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {MOCK_USERS.map((user) => (
              <form key={user.userId} action={signInAsMockUser}>
                <input type="hidden" name="userId" value={user.userId} />
                <input type="hidden" name="locale" value={locale} />
                <Button type="submit" variant="outline" className="w-full" data-testid={`sign-in-${user.userId}`}>
                  {t("signInAs", { name: user.name })}
                </Button>
              </form>
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}

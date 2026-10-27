import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/locales";
import { signInAsMockUser } from "@/lib/auth/mock-actions";
import { MOCK_USERS } from "@/lib/auth/mock-session";
import { serverEnv } from "@/lib/env";
import { SignInForm } from "./sign-in-form";

/** Read at request time: the sign-in mode is a runtime setting, so one build serves both modes. Call only under <Suspense>. */
export async function SignInView({ locale }: { locale: AppLocale }) {
  await connection();
  const t = await getTranslations("SignIn");
  if (serverEnv().authMode === "mock") {
    return (
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
    );
  }
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SignInForm locale={locale} />
      </CardContent>
    </Card>
  );
}

import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { serverEnv } from "@/lib/env";
import { ForgotPasswordForm } from "./forgot-password-form";

/** Spec M5c: "Forgot password?". Password mode only. Call only under <Suspense>. */
export async function ForgotPasswordView() {
  await connection();
  if (serverEnv().authMode !== "password") notFound();
  const t = await getTranslations("ForgotPassword");
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-2xl">{t("title")}</CardTitle>
        <CardDescription>{t("intro")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ForgotPasswordForm />
        <Link href="/sign-in" data-testid="forgot-back" className="text-sm font-medium text-primary underline">
          {t("back")}
        </Link>
      </CardContent>
    </Card>
  );
}

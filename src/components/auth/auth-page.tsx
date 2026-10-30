import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ProductMark } from "@/components/brand/node-q";
import { LocaleSwitch } from "@/components/shell/locale-switch";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/** The frame of the pages outside the signed-in shell: sign-in, invitation, forgot and reset password, no access. */
export async function AuthPage({ children }: { children: ReactNode }) {
  const t = await getTranslations("Shell");
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="absolute end-4 top-4 flex gap-2">
        <ThemeToggle />
        <LocaleSwitch />
      </div>
      <ProductMark name={t("brand")} byline={t("byline")} />
      <div className="flex w-full justify-center animate-in fade-in-0 slide-in-from-bottom-1 duration-300">{children}</div>
    </main>
  );
}

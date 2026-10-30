import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ByQuantum1st, ProductMark, QalamMark } from "@/components/brand/qalam-mark";
import { Splash } from "@/components/brand/splash";
import { LocaleSwitch } from "@/components/shell/locale-switch";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/**
 * The frame of the pages outside the signed-in shell: sign-in, invitation, forgot and reset password, no access.
 * P2b: on wide screens, Qalam's story on an ink panel beside the form; on phones, the form under the Qalam mark.
 */
export async function AuthPage({ children }: { children: ReactNode }) {
  const t = await getTranslations("Shell");
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
      <Splash />
      <section className="relative hidden flex-col overflow-hidden bg-[#07090f] p-14 text-[#eef1f7] lg:flex">
        <div className="flex items-center gap-3" dir="ltr">
          <QalamMark size={40} className="text-[#eef1f7]" />
          <span className="flex flex-col leading-none">
            <span className="text-2xl font-semibold tracking-[-0.05em]">qalam</span>
            <ByQuantum1st className="mt-1 font-mono text-[11px] text-[#a9b1c4]" />
          </span>
        </div>
        <div className="relative z-10 mt-auto flex max-w-xl flex-col gap-5">
          <p className="text-sm font-medium text-[#e3a857]">{t("slogan")}</p>
          <p className="text-[40px] leading-[1.12] font-semibold tracking-[-0.035em]">{t("pitch")}</p>
          <p className="text-base leading-relaxed text-[#a9b1c4]">{t("pitchSub")}</p>
        </div>
        <QalamMark size={560} className="pointer-events-none absolute -end-44 top-24 text-[#eef1f7] opacity-[0.07]" />
      </section>
      <main className="relative flex flex-col items-center justify-center gap-6 bg-background p-6">
        <div className="absolute end-4 top-4 flex gap-2">
          <LocaleSwitch />
          <ThemeToggle />
        </div>
        <div className="lg:hidden">
          <ProductMark name={t("brand")} />
        </div>
        <div className="flex w-full justify-center animate-in fade-in-0 slide-in-from-bottom-1 duration-300">{children}</div>
      </main>
    </div>
  );
}

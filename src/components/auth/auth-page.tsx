import type { ReactNode } from "react";
import { LocaleSwitch } from "@/components/shell/locale-switch";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/** The frame of the pages outside the signed-in shell: sign-in, invitation, forgot and reset password. */
export function AuthPage({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center p-6">
      <div className="absolute end-4 top-4 flex gap-2">
        <ThemeToggle />
        <LocaleSwitch />
      </div>
      {children}
    </main>
  );
}

import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { getTwoFactorPolicy, requireSession } from "@/lib/auth/session";
import { twoFactorStatus } from "@/lib/auth/two-factor";
import { cn } from "@/lib/utils";
import { SignOutControl } from "./sign-out-control";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word))
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.match(/\p{L}/u)?.[0]?.toUpperCase() ?? "")
    .join("");

/** P2b: the signed-in person at the foot of the page list: who, their role, and their own pages and sign out. */
export async function UserMenu({ locale }: { locale: AppLocale }) {
  const session = await requireSession(locale);
  const t = await getTranslations("Shell");
  const status = twoFactorStatus(await getTwoFactorPolicy(), session);
  const remind = status === "required" || status === "recommended";
  const link = "rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:bg-background hover:text-foreground";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-2.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-semibold text-background">
          {initials(session.name)}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13.5px] font-semibold" data-testid="user-name">
            {session.name}
          </span>
          <Badge variant="secondary" data-testid="user-role" className="w-fit">
            {t(`role.${session.role}`)}
          </Badge>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-1">
        <Link href="/notifications" data-testid="user-notifications" className={link}>
          {t("notifications")}
        </Link>
        {/* Design §5: two-factor login is recommended for Reviewers; the link is the reminder until it's on (unless TWO_FACTOR=off). */}
        <Link href="/security" data-testid="user-security" className={cn(link, remind && "font-medium text-warn-fg")}>
          {remind ? t("turnOnTwoFactor") : t("security")}
        </Link>
        <SignOutControl locale={locale} />
      </div>
    </div>
  );
}

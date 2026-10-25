import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/locales";
import { getTwoFactorPolicy, requireSession } from "@/lib/auth/session";
import { twoFactorStatus } from "@/lib/auth/two-factor";
import { cn } from "@/lib/utils";
import { SignOutControl } from "./sign-out-control";

export async function UserMenu({ locale }: { locale: AppLocale }) {
  const session = await requireSession(locale);
  const t = await getTranslations("Shell");
  const status = twoFactorStatus(await getTwoFactorPolicy(), session);
  const remind = status === "required" || status === "recommended";
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm" data-testid="user-name">
        {session.name}
      </span>
      <Badge variant="secondary" data-testid="user-role">
        {t(`role.${session.role}`)}
      </Badge>
      <Link href="/notifications" data-testid="user-notifications" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        {t("notifications")}
      </Link>
      {/* Design §5: two-factor login is recommended for Reviewers; the link is the reminder until it's on (unless TWO_FACTOR=off). */}
      <Link
        href="/security"
        data-testid="user-security"
        className={cn("text-sm underline-offset-4 hover:underline", remind ? "font-medium text-warn-fg" : "text-muted-foreground")}
      >
        {remind ? t("turnOnTwoFactor") : t("security")}
      </Link>
      <SignOutControl locale={locale} />
    </div>
  );
}

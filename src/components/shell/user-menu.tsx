import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { SignOutControl } from "./sign-out-control";

export async function UserMenu({ locale }: { locale: AppLocale }) {
  const session = await requireSession(locale);
  const t = await getTranslations("Shell");
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm" data-testid="user-name">
        {session.name}
      </span>
      <Badge variant="secondary" data-testid="user-role">
        {t(`role.${session.role}`)}
      </Badge>
      <SignOutControl locale={locale} />
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { visibleNavItems } from "./nav";
import { NavLink } from "./nav-link";

export async function SidebarNav({ locale }: { locale: AppLocale }) {
  const session = await requireSession(locale);
  const t = await getTranslations("Shell.nav");
  return (
    <nav aria-label={t("label")}>
      <ul className="flex flex-col gap-1">
        {visibleNavItems(session.role).map((item) => (
          <li key={item.key}>
            <NavLink href={item.href} match={item.match} testId={`nav-${item.key}`}>
              {t(item.key)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

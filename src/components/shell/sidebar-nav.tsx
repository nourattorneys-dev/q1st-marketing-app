import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/locales";
import { requireSession } from "@/lib/auth/session";
import { NAV_GROUPS, visibleNavItems } from "./nav";
import { NavIcon } from "./nav-icon";
import { NavLink } from "./nav-link";

/** The page list, in groups (work, website, team); a group the role sees nothing of is left out. */
export async function SidebarNav({ locale }: { locale: AppLocale }) {
  const session = await requireSession(locale);
  const t = await getTranslations("Shell.nav");
  const items = visibleNavItems(session.role);
  return (
    <nav aria-label={t("label")} className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => {
        const inGroup = items.filter((item) => item.group === group);
        if (!inGroup.length) return null;
        return (
          <div key={group} className="flex flex-col gap-0.5">
            <span className="px-3 pb-1.5 text-[11px] text-muted-foreground ltr:font-mono ltr:text-[10.5px] ltr:tracking-[0.1em] ltr:uppercase">{t(`group.${group}`)}</span>
            <ul className="flex flex-col gap-0.5">
              {inGroup.map((item) => (
                <li key={item.key}>
                  <NavLink href={item.href} match={item.match} testId={`nav-${item.key}`}>
                    <NavIcon name={item.key} />
                    <span>{t(item.key)}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

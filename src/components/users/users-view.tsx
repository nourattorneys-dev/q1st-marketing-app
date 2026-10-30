import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/locales";
import { getTwoFactorPolicy, requirePermission } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { serverEnv } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format/datetime";
import { getCurrentSite } from "@/lib/tenancy";
import { getDirectory } from "@/lib/users/directory";
import { tryDirectory } from "@/lib/users/types";
import { UsersBoard } from "./users-board";

/** Design §7 /users (Admin): everyone who can sign in, with role, two-factor status and last sign-in; invitations (design §5). */
export async function UsersView({ locale }: { locale: AppLocale }) {
  const session = await requirePermission(locale, "users.manage");
  const t = await getTranslations("Users");
  const listed = await tryDirectory(async () => (await getDirectory()).list());
  if (!listed.ok) {
    return (
      <div role="alert" data-testid="users-unavailable" className="rounded-lg border border-bad-fg/30 bg-bad-bg p-4 text-sm text-bad-fg">
        {t.has(`errors.${listed.error.code}`) ? t(`errors.${listed.error.code}`) : listed.error.message}
      </div>
    );
  }

  const current = await getCurrentSite();
  // Times in the site's timezone, as everywhere else (M1); UTC when the engine can't say.
  const engine = await getEngine();
  const site = await tryEngine(() => engine.siteTimezone());
  const timeZone = site.ok ? site.data.timezone : "UTC";
  // When an invitation counts as expired (spec M5c): this request's moment, read once.
  const now = new Date();

  return (
    <UsersBoard
      locale={locale}
      selfId={session.userId}
      testLogins={serverEnv().authMode === "mock"}
      showTwoFactor={(await getTwoFactorPolicy()) !== "off"}
      sites={current?.sites ?? []}
      users={listed.data.users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        twoFactor: user.twoFactor,
        siteIds: user.siteIds,
        lastSignIn: user.lastSignInAt ? formatDateTime(user.lastSignInAt, { timeZone, locale }) : null,
      }))}
      invites={listed.data.invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        sentOn: formatDate(invite.createdAt, { timeZone, locale }),
        expiresOn: invite.expiresAt ? formatDate(invite.expiresAt, { timeZone, locale }) : null,
        expired: invite.expiresAt !== null && new Date(invite.expiresAt).getTime() <= now.getTime(),
      }))}
    />
  );
}

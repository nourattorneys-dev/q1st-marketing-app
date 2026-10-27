"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { inviteUserAction, resendInviteAction, revokeInviteAction, setUserRoleAction } from "@/app/[locale]/(app)/users/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import { isRole, ROLES, type Role } from "@/lib/auth/roles";
import type { EngineFailure } from "@/lib/engine/result";
import { MAIL_ERROR_KINDS } from "@/lib/notifications/mail-error";

const SELECT = "h-9 rounded-md border border-input bg-card px-3 text-sm disabled:opacity-50";
const NONE = "none";

export type UserRow = { id: string; name: string; email: string; role: Role | null; twoFactor: boolean; lastSignIn: string | null };
export type InviteRow = { id: string; email: string; role: Role | null; sentOn: string; expiresOn: string | null; expired: boolean };

/** `showTwoFactor`: false with TWO_FACTOR=off, which drops the two-factor column. */
type Props = { locale: string; selfId: string; testLogins: boolean; showTwoFactor: boolean; users: UserRow[]; invites: InviteRow[] };

/** Design §7 /users: change someone's access, invite by email with a role, revoke a pending invitation. */
export function UsersBoard({ locale, selfId, testLogins, showTwoFactor, users, invites }: Props) {
  const t = useTranslations("Users");
  // Which row's change went through last; kept here because a row remounts when its role comes back changed.
  const [changed, setChanged] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {testLogins && (
        <p data-testid="users-test-notice" className="text-sm text-muted-foreground">
          {t("testNotice")}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("people")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2 pe-4 text-start font-medium">{t("table.person")}</th>
                {showTwoFactor && <th className="pb-2 pe-4 text-start font-medium">{t("table.twoFactor")}</th>}
                <th className="pb-2 pe-4 text-start font-medium">{t("table.lastSignIn")}</th>
                <th className="pb-2 text-start font-medium">{t("table.access")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <UserRowView
                  key={`${user.id}:${user.role ?? NONE}`}
                  locale={locale}
                  user={user}
                  showTwoFactor={showTwoFactor}
                  self={user.id === selfId}
                  changed={changed === user.id}
                  onStart={() => setChanged(null)}
                  onDone={() => setChanged(user.id)}
                />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <InviteForm locale={locale} />
      <PendingInvites locale={locale} invites={invites} />
    </div>
  );
}

function useFailureText() {
  const t = useTranslations("Users.errors");
  const tMail = useTranslations("Notifications.testEmail");
  return (error: EngineFailure) => {
    // Spec M5c: an invitation the mail server refused says why, in the test email's words, with the server's reply.
    if (error.code === "mail_failed") {
      const kind = MAIL_ERROR_KINDS.find((each) => each === error.details?.kind) ?? "other";
      const reply = typeof error.details?.reply === "string" && error.details.reply ? ` (${error.details.reply})` : "";
      return `${tMail(`failed.${kind}`)}${reply}`;
    }
    return t.has(error.code) ? t(error.code) : error.message;
  };
}

type RowProps = { locale: string; user: UserRow; showTwoFactor: boolean; self: boolean; changed: boolean; onStart: () => void; onDone: () => void };

function UserRowView({ locale, user, showTwoFactor, self, changed, onStart, onDone }: RowProps) {
  const t = useTranslations("Users");
  const failureText = useFailureText();
  const setRole = useEngineAction(setUserRoleAction);
  const current = user.role ?? NONE;
  const [choice, setChoice] = useState<string>(current);
  const [error, setError] = useState<EngineFailure | null>(null);

  async function apply() {
    setError(null);
    onStart();
    const result = await setRole.run({ locale, userId: user.id, role: isRole(choice) ? choice : null });
    if (result.ok) onDone();
    else setError(result.error);
  }

  return (
    <tr data-testid={`user-${user.id}`} className="border-t border-border align-top">
      <td className="py-3 pe-4">
        <p className="flex items-center gap-2 font-medium">
          {user.name}
          {self && (
            <Badge variant="secondary" data-testid={`user-you-${user.id}`}>
              {t("you")}
            </Badge>
          )}
        </p>
        <p className="text-muted-foreground">
          <bdi>{user.email}</bdi>
        </p>
      </td>
      {showTwoFactor && (
        <td className="py-3 pe-4" data-testid={`user-twofactor-${user.id}`}>
          {user.twoFactor ? t("twoFactorOn") : t("twoFactorOff")}
        </td>
      )}
      <td className="py-3 pe-4" data-testid={`user-last-${user.id}`}>
        {user.lastSignIn ?? t("never")}
      </td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          <select
            aria-label={t("accessFor", { name: user.name })}
            data-testid={`user-role-${user.id}`}
            className={SELECT}
            disabled={self || setRole.pending}
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`roles.${role}`)}
              </option>
            ))}
            <option value={NONE}>{t("roles.none")}</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            data-testid={`user-apply-${user.id}`}
            aria-label={t("applyFor", { name: user.name })}
            disabled={self || setRole.pending || choice === current}
            onClick={() => void apply()}
          >
            {t("apply")}
          </Button>
        </div>
        {self && <p className="mt-1 text-xs text-muted-foreground">{t("selfHint")}</p>}
        {changed && (
          <p role="status" data-testid={`user-changed-${user.id}`} className="mt-1 text-sm text-ok-fg">
            {t("changed")}
          </p>
        )}
        {error && (
          <p role="alert" data-testid={`user-error-${user.id}`} className="mt-1 text-sm text-bad-fg">
            {failureText(error)}
          </p>
        )}
      </td>
    </tr>
  );
}

function InviteForm({ locale }: { locale: string }) {
  const t = useTranslations("Users");
  const failureText = useFailureText();
  const invite = useEngineAction(inviteUserAction);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("reviewer");
  const [sent, setSent] = useState<{ email: string; notSent: boolean } | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const fieldError = error?.fields?.email ? t("errors.invalidEmail") : null;

  async function submit() {
    setError(null);
    setSent(null);
    const result = await invite.run({ locale, email, role: inviteRole });
    if (result.ok) {
      setSent({ email: result.data.email, notSent: result.data.notSent });
      setEmail("");
    } else {
      setError(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("invite.title")}</CardTitle>
        <CardDescription>{t("invite.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <form
          noValidate
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex min-w-64 flex-1 flex-col gap-1.5">
            <Label htmlFor="invite-email">{t("invite.email")}</Label>
            <Input
              id="invite-email"
              data-testid="invite-email"
              type="email"
              dir="ltr"
              autoComplete="off"
              value={email}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "invite-email-error" : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">{t("invite.role")}</Label>
            <select
              id="invite-role"
              data-testid="invite-role"
              className={SELECT}
              value={inviteRole}
              onChange={(event) => {
                if (isRole(event.target.value)) setInviteRole(event.target.value);
              }}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" data-testid="invite-submit" disabled={invite.pending || email.trim() === ""}>
            {t("invite.submit")}
          </Button>
        </form>
        {fieldError && (
          <p id="invite-email-error" data-testid="invite-email-error" className="text-sm text-bad-fg">
            {fieldError}
          </p>
        )}
        {error && !fieldError && (
          <p role="alert" data-testid="invite-error" className="text-sm text-bad-fg">
            {failureText(error)}
          </p>
        )}
        {sent &&
          (sent.notSent ? (
            <p role="status" data-testid="invite-not-sent" className="text-sm text-muted-foreground">
              {t("invite.notSent")}
            </p>
          ) : (
            <p role="status" data-testid="invite-sent" className="text-sm text-ok-fg">
              {t("invite.sent", { email: sent.email })}
            </p>
          ))}
      </CardContent>
    </Card>
  );
}

function PendingInvites({ locale, invites }: { locale: string; invites: InviteRow[] }) {
  const t = useTranslations("Users");
  const failureText = useFailureText();
  const revoke = useEngineAction(revokeInviteAction);
  const resend = useEngineAction(resendInviteAction);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [resent, setResent] = useState<{ email: string; notSent: boolean } | null>(null);
  const busy = revoke.pending || resend.pending;

  async function revokeOne(inviteId: string) {
    setError(null);
    setResent(null);
    const result = await revoke.run({ locale, inviteId });
    if (!result.ok) setError(result.error);
  }

  async function resendOne(inviteId: string) {
    setError(null);
    setResent(null);
    const result = await resend.run({ locale, inviteId });
    if (result.ok) setResent({ email: result.data.email, notSent: result.data.notSent });
    else setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("invites.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {invites.length === 0 ? (
          <p data-testid="invites-empty" className="text-muted-foreground">
            {t("invites.empty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {invites.map((invite) => (
              <li key={invite.id} data-testid={`pending-invite-${invite.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <bdi>{invite.email}</bdi> · {t(`roles.${invite.role ?? NONE}`)} · {t("invites.sentOn", { date: invite.sentOn })}
                  {(invite.expired || invite.expiresOn) && (
                    <>
                      {" · "}
                      <span data-testid={`pending-expiry-${invite.id}`} data-expired={String(invite.expired)} className={invite.expired ? "text-bad-fg" : undefined}>
                        {invite.expired ? t("invites.expired") : t("invites.expires", { date: invite.expiresOn ?? "" })}
                      </span>
                    </>
                  )}
                </span>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`pending-resend-${invite.id}`}
                    aria-label={t("resendFor", { email: invite.email })}
                    disabled={busy}
                    onClick={() => void resendOne(invite.id)}
                  >
                    {t("invites.resend")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`pending-revoke-${invite.id}`}
                    aria-label={t("revokeFor", { email: invite.email })}
                    disabled={busy}
                    onClick={() => void revokeOne(invite.id)}
                  >
                    {t("invites.revoke")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {resent && (
          <p role="status" data-testid="invites-resent" data-not-sent={String(resent.notSent)} className="text-sm text-ok-fg">
            {resent.notSent ? t("invites.resentNotSent") : t("invites.resent", { email: resent.email })}
          </p>
        )}
        {error && (
          <p role="alert" data-testid="invites-error" className="text-sm text-bad-fg">
            {failureText(error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

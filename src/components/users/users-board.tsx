"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { inviteUserAction, revokeInviteAction, setUserRoleAction } from "@/app/[locale]/(app)/users/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import { isRole, ROLES, type Role } from "@/lib/auth/roles";
import type { EngineFailure } from "@/lib/engine/result";

const SELECT = "h-9 rounded-md border border-input bg-card px-3 text-sm disabled:opacity-50";
const NONE = "none";

export type UserRow = { id: string; name: string; email: string; role: Role | null; twoFactor: boolean; lastSignIn: string | null };
export type InviteRow = { id: string; email: string; role: Role | null; sentOn: string };

type Props = { locale: string; selfId: string; testLogins: boolean; users: UserRow[]; invites: InviteRow[] };

/** Design §7 /users: change someone's access, invite by email with a role, revoke a pending invitation. */
export function UsersBoard({ locale, selfId, testLogins, users, invites }: Props) {
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
                <th className="pb-2 pe-4 text-start font-medium">{t("table.twoFactor")}</th>
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
  return (error: EngineFailure) => (t.has(error.code) ? t(error.code) : error.message);
}

type RowProps = { locale: string; user: UserRow; self: boolean; changed: boolean; onStart: () => void; onDone: () => void };

function UserRowView({ locale, user, self, changed, onStart, onDone }: RowProps) {
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
      <td className="py-3 pe-4" data-testid={`user-twofactor-${user.id}`}>
        {user.twoFactor ? t("twoFactorOn") : t("twoFactorOff")}
      </td>
      <td className="py-3 pe-4" data-testid={`user-last-${user.id}`}>
        {user.lastSignIn ?? t("never")}
      </td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          <select
            aria-label={t("table.access")}
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
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const fieldError = error?.fields?.email ? t("errors.invalidEmail") : null;

  async function submit() {
    setError(null);
    setSentTo(null);
    const result = await invite.run({ locale, email, role: inviteRole });
    if (result.ok) {
      setSentTo(result.data.email);
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
        {sentTo && (
          <p role="status" data-testid="invite-sent" className="text-sm text-ok-fg">
            {t("invite.sent", { email: sentTo })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PendingInvites({ locale, invites }: { locale: string; invites: InviteRow[] }) {
  const t = useTranslations("Users");
  const failureText = useFailureText();
  const revoke = useEngineAction(revokeInviteAction);
  const [error, setError] = useState<EngineFailure | null>(null);

  async function revokeOne(inviteId: string) {
    setError(null);
    const result = await revoke.run({ locale, inviteId });
    if (!result.ok) setError(result.error);
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
                </span>
                <Button size="sm" variant="outline" data-testid={`pending-revoke-${invite.id}`} disabled={revoke.pending} onClick={() => void revokeOne(invite.id)}>
                  {t("invites.revoke")}
                </Button>
              </li>
            ))}
          </ul>
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

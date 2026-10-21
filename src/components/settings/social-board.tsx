"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  connectSearchConsoleAction,
  connectSocialAction,
  disconnectSearchConsoleAction,
  disconnectSocialAction,
} from "@/app/[locale]/(app)/settings/actions";
import { ActionError } from "@/components/actions/action-error";
import { ConfirmDialog } from "@/components/editor/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NETWORK_FAILURE } from "@/lib/actions/result";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import { safeRedirectUrl } from "@/lib/settings/addresses";
import type { SocialRow } from "@/lib/settings/social";
import { cn } from "@/lib/utils";

export type SocialBoardRow = SocialRow & { expires: string | null };
type Props = { locale: string; rows: SocialBoardRow[]; connected: string | null };

const TONE: Record<string, string> = { ok: "bg-ok-bg text-ok-fg", expiring: "bg-warn-bg text-warn-fg", missing: "bg-muted text-muted-foreground" };

/** Spec v1.1 §6 Social: Connect or Reconnect per account (an OAuth round trip through the engine), the token's expiry, and Disconnect. */
export function SocialBoard({ locale, rows, connected }: Props) {
  const t = useTranslations("Settings.social");
  const disconnectSocial = useEngineAction(disconnectSocialAction);
  const disconnectSearch = useEngineAction(disconnectSearchConsoleAction);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<EngineFailure | null>(null);
  const [unsafe, setUnsafe] = useState(false);
  const name = (key: string) => (t.has(`platforms.${key}`) ? t(`platforms.${key}`) : key);
  const statusLabel = (status: string) => (t.has(`statuses.${status}`) ? t(`statuses.${status}`) : status);

  async function connect(row: SocialBoardRow) {
    setError(null);
    setUnsafe(false);
    setBusy(row.key);
    const result = await (row.searchConsole ? connectSearchConsoleAction({ locale }) : connectSocialAction({ locale, platform: row.key })).catch(
      () => ({ ok: false as const, error: NETWORK_FAILURE }),
    );
    if (!result.ok) {
      setError(result.error);
      setBusy(null);
      return;
    }
    const target = safeRedirectUrl(result.data.authorizeUrl);
    if (!target) {
      setUnsafe(true);
      setBusy(null);
      return;
    }
    window.location.assign(target);
  }

  const disconnect = (row: SocialBoardRow) => async (): Promise<EngineFailure | null> => {
    const result = row.searchConsole ? await disconnectSearch.run({ locale }) : await disconnectSocial.run({ locale, platform: row.key });
    return result.ok ? null : result.error;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {connected && (
          <p role="status" data-testid="social-connected" className="rounded-md bg-ok-bg px-3 py-2 text-sm text-ok-fg">
            {t("connected", { platform: name(connected) })}
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.key} data-testid={`social-row-${row.key}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{name(row.key)}</span>
                {row.searchConsole && <span className="text-xs text-muted-foreground">{t("searchConsoleHint")}</span>}
                <span
                  data-testid={`social-status-${row.key}`}
                  data-status={row.status}
                  className={cn("w-fit rounded px-2 py-0.5 text-xs", TONE[row.status] ?? "bg-bad-bg text-bad-fg")}
                >
                  {statusLabel(row.status)}
                </span>
                {row.accountName && <span className="text-sm text-muted-foreground">{t("account", { name: row.accountName })}</span>}
                {row.expires && (
                  <span data-testid={`social-expires-${row.key}`} className="text-sm text-muted-foreground">
                    {t("expires", { time: row.expires })}
                  </span>
                )}
                {row.lastError && <span className="text-sm text-bad-fg">{t("lastError", { error: row.lastError })}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" data-testid={`social-connect-${row.key}`} disabled={busy !== null} onClick={() => void connect(row)}>
                  {row.status === "missing" ? t("connect") : t("reconnect")}
                </Button>
                {row.status !== "missing" && (
                  <ConfirmDialog
                    testId={`social-disconnect-${row.key}`}
                    triggerLabel={t("disconnect")}
                    title={t("disconnectTitle", { platform: name(row.key) })}
                    description={t("disconnectBody", { platform: name(row.key) })}
                    confirmLabel={t("disconnect")}
                    pending={disconnectSocial.pending || disconnectSearch.pending}
                    onConfirm={disconnect(row)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
        {unsafe && (
          <p role="alert" data-testid="social-unsafe-address" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
            {t("unsafeAddress")}
          </p>
        )}
        {error && <ActionError error={error} />}
      </CardContent>
    </Card>
  );
}

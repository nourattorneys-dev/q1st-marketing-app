"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { settingsPageFor } from "@/lib/dashboard/connections";
import { engineNoticeKey } from "@/lib/engine/notice";
import type { EngineFailure } from "@/lib/engine/result";

type Props = { error: EngineFailure; canManageSettings?: boolean };

export function ActionError({ error, canManageSettings = false }: Props) {
  const t = useTranslations("Errors");
  if (error.code === "not_connected") return <NotConnected error={error} canManageSettings={canManageSettings} />;
  const key = engineNoticeKey(error.code);
  return (
    <p role="alert" data-testid="action-error" data-code={error.code} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
      {key ? t(key) : error.message}
    </p>
  );
}

/** Design §9 422 not_connected: the Admin gets a link to the settings page that fixes it; anyone else is told to ask the admin. */
function NotConnected({ error, canManageSettings }: { error: EngineFailure; canManageSettings: boolean }) {
  const t = useTranslations("NotConnected");
  const connection = typeof error.details?.connection === "string" ? error.details.connection : null;
  return (
    <div role="alert" data-testid="not-connected" data-connection={connection ?? ""} className="flex flex-col gap-1 rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
      <p>{connection && t.has(`names.${connection}`) ? t("message", { name: t(`names.${connection}`) }) : error.message}</p>
      {canManageSettings ? (
        <Link href={settingsPageFor(connection ?? "website")} data-testid="not-connected-fix" className="font-medium underline">
          {t("fix")}
        </Link>
      ) : (
        <p data-testid="not-connected-ask-admin">{t("askAdmin")}</p>
      )}
    </div>
  );
}

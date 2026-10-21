import { headers } from "next/headers";
import { EngineNotice } from "@/components/dashboard/engine-notice";
import type { AppLocale } from "@/i18n/locales";
import { requirePermission } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";
import { formatDateTime } from "@/lib/format/datetime";
import { servicesEnv } from "@/lib/services-env";
import { originOf } from "@/lib/settings/addresses";
import { decryptSecret, secretKeyFor } from "@/lib/webhooks/secret";
import { hookUrlFor, webhookStatus } from "@/lib/webhooks/status";
import { WebhookBoard } from "./webhook-board";

/** Spec v1.1 §6 /account "Webhook URL setup" (design §5: Settings, Admin): where deliveries go, and whether they can be verified. */
export async function WebhookView({ locale }: { locale: AppLocale }) {
  await requirePermission(locale, "settings.manage");
  const engine = await getEngine();
  const [registered, site] = await Promise.all([tryEngine(() => engine.webhookSettings()), tryEngine(() => engine.siteTimezone())]);
  if (!registered.ok) return <EngineNotice error={registered.error} />;

  const store = getStore();
  const [config, lastEventAt] = await Promise.all([store.webhook(), store.lastEventAt()]);
  const key = secretKeyFor(servicesEnv());
  const storedUrl = config && key && decryptSecret(config.secretCipher, key) ? config.url : null;
  const origin = originOf(await headers());
  const ourUrl = origin ? hookUrlFor(origin) : null;
  const timeZone = site.ok ? site.data.timezone : "UTC";

  return (
    <WebhookBoard
      locale={locale}
      status={webhookStatus(registered.data.url, storedUrl, ourUrl)}
      ourUrl={ourUrl}
      registeredUrl={registered.data.url ?? null}
      lastEvent={lastEventAt ? formatDateTime(lastEventAt.toISOString(), { timeZone, locale }) : null}
      canStore={key !== null}
    />
  );
}

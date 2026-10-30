import { getTranslations } from "next-intl/server";
import { ensureFirstAdmin } from "@/lib/accounts/first-admin";
import { getAccountStore, getExclusive } from "@/lib/db";
import { ensureTenancy } from "@/lib/tenancy";
import { mailerFor } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";

/** Spec M5c "The first Admin": shown on the sign-in page while the dashboard has no Admin; rendering it sends the invitation. */
export async function FirstAdminNotice({ appUrl, adminEmail }: { appUrl: string; adminEmail: string | null }) {
  // P1b: the first client comes from the settings file; ADMIN_EMAIL is its first Admin.
  await ensureTenancy();
  const store = getAccountStore();
  const setup = await ensureFirstAdmin({
    store,
    clientId: (await store.clients())[0]?.id ?? null,
    exclusive: getExclusive(),
    mailer: mailerFor(servicesEnv()),
    appUrl,
    adminEmail,
    now: new Date(),
  });
  if (setup.state === "ready") return null;
  const t = await getTranslations("SignIn.firstAdmin");
  return (
    <p role="status" data-testid="first-admin" data-state={setup.state} className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
      {setup.state === "invited" ? t("invited", { email: setup.to }) : t(setup.state)}
    </p>
  );
}

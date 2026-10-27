import { getTranslations } from "next-intl/server";
import { ensureFirstAdmin } from "@/lib/accounts/first-admin";
import { getAccountStore, getStore } from "@/lib/db";
import { mailerFor } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";

/** Spec M5c "The first Admin": shown on the sign-in page while the dashboard has no Admin; rendering it sends the invitation. */
export async function FirstAdminNotice({ appUrl, adminEmail }: { appUrl: string; adminEmail: string | null }) {
  const setup = await ensureFirstAdmin({
    store: getAccountStore(),
    exclusive: getStore().exclusive,
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

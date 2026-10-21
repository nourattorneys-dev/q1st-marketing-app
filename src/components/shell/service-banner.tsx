import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { tryEngine } from "@/lib/engine/result";

/** Design §9: a revoked or missing key (401) shows one site-wide banner, above whatever each section says. */
export async function ServiceBanner() {
  let code: string | null = null;
  try {
    const session = await getSession();
    if (!session?.role) return null;
    const engine = await getEngine();
    const meta = await tryEngine(() => engine.meta());
    code = meta.ok ? null : meta.error.code;
  } catch {
    return null; // anything else that went wrong is shown by the page's error boundary
  }
  if (code !== "unauthorized") return null;
  const t = await getTranslations("Errors");
  return (
    <div role="alert" data-testid="service-banner" className="border-b border-bad-fg/30 bg-bad-bg px-6 py-3 text-sm text-bad-fg">
      {t("serviceUnavailable")}
    </div>
  );
}

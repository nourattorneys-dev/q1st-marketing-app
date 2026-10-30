import { getTranslations } from "next-intl/server";
import { brandCss } from "@/lib/brand/theme";
import { getCurrentSite } from "@/lib/tenancy";
import { ByQuantum1st, ProductMark, QalamMark } from "./qalam-mark";

/**
 * P2: each client sees its own brand. With a logo: the client's logo, and under it a small "Qalam by quantum1st" line.
 * Without one: the Qalam product mark.
 */
export async function ClientBrand() {
  const t = await getTranslations("Shell");
  const current = await getCurrentSite();
  const client = current?.client;
  if (!client?.logoAt) return <ProductMark name={t("brand")} />;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" dir="ltr">
      {/* eslint-disable-next-line @next/next/no-img-element -- the app's own copy; its size is the client's */}
      <img
        src={`/api/brand/logo?v=${client.logoAt.getTime()}`}
        alt={client.name}
        data-testid="client-logo"
        className="max-h-10 max-w-44 object-contain object-left"
      />
      <span className="flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
        <QalamMark size={14} className="text-foreground" />
        {t("brand")} <ByQuantum1st />
      </span>
    </div>
  );
}

/** The client's colour for its people's pages (light and dark). Nothing when the client has none: the Quantum1st colours stay. */
export async function ClientBrandStyle() {
  const css = brandCss((await getCurrentSite())?.client.brandColor ?? null);
  return css ? <style data-testid="client-brand-style">{css}</style> : null;
}

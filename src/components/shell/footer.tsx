import { getTranslations } from "next-intl/server";
import { ByQuantum1st, QalamMark } from "@/components/brand/qalam-mark";

/** P2b: the product credit at the foot of every signed-in page. */
export async function Footer() {
  const t = await getTranslations("Shell");
  return (
    <footer className="mt-12 flex items-center gap-2 border-t border-border px-4 py-4 text-xs text-muted-foreground md:px-10" dir="ltr">
      <QalamMark size={16} className="text-foreground" />
      <span>{t("brand")}</span>
      <ByQuantum1st inText className="font-mono" />
    </footer>
  );
}

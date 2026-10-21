import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Previous · Page n of m · Next for a list page (?page=). Hidden when everything fits on one page. */
export async function Pager({ pathname, page, pages }: { pathname: string; page: number; pages: number }) {
  if (pages <= 1) return null;
  const t = await getTranslations("Lists");
  return (
    <nav aria-label={t("pages")} data-testid="pager" className="flex items-center gap-3 text-sm">
      {page > 1 && (
        <Link href={{ pathname, query: { page: String(page - 1) } }} data-testid="pager-previous" className="text-primary underline">
          {t("previous")}
        </Link>
      )}
      <span data-testid="pager-status">{t("pageOf", { page: String(Math.min(page, pages)), count: String(pages) })}</span>
      {page < pages && (
        <Link href={{ pathname, query: { page: String(page + 1) } }} data-testid="pager-next" className="text-primary underline">
          {t("next")}
        </Link>
      )}
    </nav>
  );
}

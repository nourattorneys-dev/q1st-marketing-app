import { getTranslations } from "next-intl/server";

/** Items the engine sent in an unexpected shape are left out of a list; this says how many (never a blank page). */
export async function SkippedNote({ count }: { count: number }) {
  if (count === 0) return null;
  const t = await getTranslations("Lists");
  return (
    <p role="status" data-testid="list-skipped" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-fg">
      {t("skipped", { count, n: String(count) })}
    </p>
  );
}

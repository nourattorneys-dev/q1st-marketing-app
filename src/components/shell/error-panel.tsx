"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** The dashboard's error message (Next 16 passes `retry`): translated, with Try again and the way home. */
export function ErrorPanel({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("ErrorPage");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" data-testid="error-page" className="flex max-w-xl flex-col gap-3 rounded-lg border border-bad-fg/30 bg-bad-bg p-6 text-bad-fg">
      <h1 className="font-heading text-2xl">{t("title")}</h1>
      <p>{t("body")}</p>
      <div className="flex flex-wrap gap-2">
        <Button data-testid="error-retry" onClick={() => retry()}>
          {t("retry")}
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          {t("home")}
        </Link>
      </div>
    </div>
  );
}

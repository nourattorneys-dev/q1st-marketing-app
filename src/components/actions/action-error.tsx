"use client";

import { useTranslations } from "next-intl";
import { engineNoticeKey } from "@/lib/engine/notice";
import type { EngineFailure } from "@/lib/engine/result";

export function ActionError({ error }: { error: EngineFailure }) {
  const t = useTranslations("Errors");
  const key = engineNoticeKey(error.code);
  return (
    <p role="alert" data-testid="action-error" data-code={error.code} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
      {key ? t(key) : error.message}
    </p>
  );
}

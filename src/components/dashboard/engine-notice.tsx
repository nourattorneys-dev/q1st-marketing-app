import { getTranslations } from "next-intl/server";
import { engineNoticeKey } from "@/lib/engine/notice";
import type { EngineFailure } from "@/lib/engine/result";

export async function EngineNotice({ error }: { error: EngineFailure }) {
  const t = await getTranslations("Errors");
  const key = engineNoticeKey(error.code);
  return (
    <div
      role="alert"
      data-testid="engine-notice"
      data-code={error.code}
      className="rounded-lg border border-bad-fg/30 bg-bad-bg p-4 text-sm text-bad-fg"
    >
      {key ? t(key) : error.message}
    </div>
  );
}

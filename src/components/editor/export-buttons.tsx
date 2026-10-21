"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { exportPostAction, type ExportedFile } from "@/app/[locale]/(app)/review/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { NETWORK_FAILURE } from "@/lib/actions/result";
import type { EngineFailure } from "@/lib/engine/result";

/** Saves the export in the browser. The file came through our server, so the engine's key never reached the browser. */
function saveFile(file: ExportedFile) {
  const url = URL.createObjectURL(new Blob([file.body], { type: file.contentType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportButtons({ locale, postId }: { locale: string; postId: string }) {
  const t = useTranslations("Editor");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<EngineFailure | null>(null);

  async function exportAs(format: "html" | "md") {
    setError(null);
    setPending(true);
    try {
      const result = await exportPostAction({ locale, postId, format });
      if (result.ok) saveFile(result.data);
      else setError(result.error);
    } catch {
      setError(NETWORK_FAILURE);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" data-testid="export-html" disabled={pending} onClick={() => void exportAs("html")}>
        {t("exportHtml")}
      </Button>
      <Button variant="outline" size="sm" data-testid="export-md" disabled={pending} onClick={() => void exportAs("md")}>
        {t("exportMarkdown")}
      </Button>
      {error && <ActionError error={error} />}
    </div>
  );
}

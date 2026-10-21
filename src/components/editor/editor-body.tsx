"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Post } from "@/lib/engine/schemas";
import { RichText } from "./rich-text";
import { TwinView } from "./twin-view";

type Props = {
  kind: string;
  language: string;
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  bodyKey: number;
  twin: Post | null;
};

/** Articles are HTML (rich text); social posts are plain text. An article with a twin can be compared side by side. */
export function EditorBody({ kind, language, value, editable, onChange, bodyKey, twin }: Props) {
  const t = useTranslations("Editor");
  const [comparing, setComparing] = useState(false);
  const dir = language === "ar" ? "rtl" : "ltr";
  const canCompare = kind === "blog" && twin !== null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{t("fields.content")}</Label>
        {canCompare && (
          <Button type="button" variant="outline" size="sm" data-testid="compare-toggle" onClick={() => setComparing((on) => !on)}>
            {comparing
              ? t("hideCompare")
              : t("compare", { language: t.has(`languages.${twin.language}`) ? t(`languages.${twin.language}`) : twin.language })}
          </Button>
        )}
      </div>
      {comparing && twin && <TwinView mineHtml={value} mineLanguage={language} twin={twin} />}
      {kind === "blog" ? (
        <RichText key={bodyKey} initialHtml={value} editable={editable} dir={dir} lang={language} label={t("fields.content")} onChange={onChange} />
      ) : (
        <Textarea
          data-testid="editor-body"
          aria-label={t("fields.content")}
          dir={dir}
          lang={language}
          rows={6}
          value={value}
          disabled={!editable}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

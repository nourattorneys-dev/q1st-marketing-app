"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichText } from "./rich-text";

type Props = { kind: string; language: string; value: string; editable: boolean; onChange: (value: string) => void; bodyKey: number };

/** Articles are HTML (rich text); social posts are plain text (spec v1.1 §4 Post.content). */
export function EditorBody({ kind, language, value, editable, onChange, bodyKey }: Props) {
  const t = useTranslations("Editor");
  const dir = language === "ar" ? "rtl" : "ltr";
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{t("fields.content")}</Label>
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

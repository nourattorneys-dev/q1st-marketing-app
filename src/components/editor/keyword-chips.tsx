"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function KeywordChips({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled: boolean }) {
  const t = useTranslations("Editor");
  const [draft, setDraft] = useState("");

  function add() {
    const word = draft.trim();
    if (word && !value.includes(word)) onChange([...value, word]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="keyword-input">{t("fields.keywords")}</Label>
      <div className="flex flex-wrap gap-2">
        {value.map((keyword, index) => (
          <span
            key={keyword}
            data-testid={`keyword-chip-${index}`}
            className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground"
          >
            {keyword}
            {index === 0 && <span className="text-xs opacity-70">({t("focusKeyword")})</span>}
            {!disabled && (
              <button type="button" className="ms-1" aria-label={t("removeKeyword", { keyword })} onClick={() => onChange(value.filter((k) => k !== keyword))}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <Input
          id="keyword-input"
          data-testid="keyword-input"
          value={draft}
          placeholder={t("addKeyword")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
      )}
    </div>
  );
}

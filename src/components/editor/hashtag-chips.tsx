"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseHashtags, withHashtags } from "@/lib/posts/social";

/** A social post's hashtags as chips: typed words become tags, each kept once (spec v1.1 §4: social posts only). */
export function HashtagChips({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled: boolean }) {
  const t = useTranslations("Editor");
  const [draft, setDraft] = useState("");

  function add(text: string) {
    const tags = parseHashtags(text);
    if (tags.length > 0) onChange(withHashtags(value, tags));
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="hashtag-input">{t("fields.hashtags")}</Label>
      <div data-testid="hashtags" className="flex flex-wrap gap-2">
        {value.map((tag, index) => (
          <span
            key={tag}
            data-testid={`hashtag-chip-${index}`}
            dir="auto"
            className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                className="ms-1"
                data-testid={`hashtag-remove-${index}`}
                aria-label={t("removeHashtag", { tag })}
                onClick={() => onChange(value.filter((item) => item !== tag))}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <>
          <Input
            id="hashtag-input"
            data-testid="hashtag-input"
            dir="auto"
            value={draft}
            placeholder={t("addHashtag")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(draft);
              }
            }}
            onBlur={() => {
              if (draft.trim()) add(draft);
            }}
          />
          <p className="text-xs text-muted-foreground">{t("hashtagsHint")}</p>
        </>
      )}
    </div>
  );
}

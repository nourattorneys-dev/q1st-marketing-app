"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Post } from "@/lib/engine/schemas";
import { ActionBar } from "./action-bar";

export type EditorFooterProps = {
  locale: string;
  post: Post;
  dirty: boolean;
  editable: boolean;
  saving: boolean;
  onSave: () => void;
  pollSeconds: number;
};

export function EditorFooter({ locale, post, dirty, editable, saving, onSave, pollSeconds }: EditorFooterProps) {
  const t = useTranslations("Editor");
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-3">
        {editable && (
          <Button data-testid="save" disabled={!dirty || saving} onClick={onSave}>
            {saving ? t("saving") : t("save")}
          </Button>
        )}
        {dirty && <span className="text-sm text-muted-foreground">{t("unsaved")}</span>}
      </div>
      <ActionBar locale={locale} post={post} dirty={dirty} pollSeconds={pollSeconds} />
    </div>
  );
}

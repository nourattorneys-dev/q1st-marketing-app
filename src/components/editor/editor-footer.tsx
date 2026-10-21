"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Post } from "@/lib/engine/schemas";

export type EditorFooterProps = {
  locale: string;
  post: Post;
  dirty: boolean;
  editable: boolean;
  saving: boolean;
  onSave: () => void;
  pollSeconds: number;
};

export function EditorFooter(props: EditorFooterProps) {
  const t = useTranslations("Editor");
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
      {props.editable && (
        <Button data-testid="save" disabled={!props.dirty || props.saving} onClick={props.onSave}>
          {props.saving ? t("saving") : t("save")}
        </Button>
      )}
      {props.dirty && <span className="text-sm text-muted-foreground">{t("unsaved")}</span>}
    </div>
  );
}

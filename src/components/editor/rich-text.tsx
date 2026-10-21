"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { editorExtensions } from "./extensions";

type Props = { initialHtml: string; editable: boolean; dir: "ltr" | "rtl"; lang: string; label: string; onChange: (html: string) => void };

export function RichText({ initialHtml, editable, dir, lang, label, onChange }: Props) {
  const t = useTranslations("Editor.toolbar");
  const editor = useEditor({
    extensions: editorExtensions,
    content: initialHtml,
    editable,
    immediatelyRender: false, // server-rendered page: create the editor in the browser only
    editorProps: {
      attributes: {
        dir,
        lang,
        "aria-label": label,
        "data-testid": "editor-body",
        class: "prose-article min-h-64 rounded-md border border-input bg-card p-4 focus:outline-none",
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return <div className="min-h-64 rounded-md border border-input bg-card" aria-hidden="true" />;

  const tools: [string, () => boolean][] = [
    ["h2", () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
    ["h3", () => editor.chain().focus().toggleHeading({ level: 3 }).run()],
    ["bold", () => editor.chain().focus().toggleBold().run()],
    ["italic", () => editor.chain().focus().toggleItalic().run()],
    ["bulletList", () => editor.chain().focus().toggleBulletList().run()],
    ["orderedList", () => editor.chain().focus().toggleOrderedList().run()],
  ];

  return (
    <div className="flex flex-col gap-2">
      {editable && (
        <div role="toolbar" aria-label={label} className="flex flex-wrap gap-1">
          {tools.map(([key, apply]) => (
            <Button key={key} type="button" variant="outline" size="xs" onClick={() => apply()}>
              {t(key)}
            </Button>
          ))}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

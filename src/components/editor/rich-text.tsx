"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { editorExtensions } from "./extensions";

type Props = { initialHtml: string; editable: boolean; dir: "ltr" | "rtl"; lang: string; label: string; onChange: (html: string) => void };

export function RichText({ initialHtml, editable, dir, lang, label, onChange }: Props) {
  const t = useTranslations("Editor.toolbar");
  // TipTap rewrites engine HTML into its own form (e.g. <li>text</li> becomes <li><p>text</p></li>), so "changed"
  // is measured against the editor's form of what it loaded, and an unchanged document reports the HTML it was given.
  // initialHtml follows the form as the reviewer types; the editor remounts (key) whenever new content is loaded.
  const original = useRef(initialHtml);
  const loaded = useRef<string | null>(null);
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
    onCreate: ({ editor: current }) => {
      loaded.current = current.getHTML();
    },
    onUpdate: ({ editor: current }) => {
      const html = current.getHTML();
      onChange(html === loaded.current ? original.current : html);
    },
  });

  useEffect(() => {
    editor?.setEditable(editable, false); // a lock change isn't an edit: don't emit an update
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

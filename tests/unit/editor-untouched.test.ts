// @vitest-environment happy-dom
import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";
import { editorExtensions } from "@/components/editor/extensions";

const ENDS_WITH_LIST = "<p>The plan decides it.</p><ul><li>Performance</li><li>The event</li></ul>";

describe("an article the reviewer only reads stays unchanged", () => {
  let editor: Editor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it("moving the cursor into an article that ends with a list doesn't change its document", () => {
    const updates: string[] = [];
    editor = new Editor({ extensions: editorExtensions, content: ENDS_WITH_LIST, onUpdate: ({ editor: current }) => updates.push(current.getHTML()) });
    const loaded = editor.getHTML();

    editor.commands.setTextSelection(3);
    editor.commands.focus("end");

    expect(updates).toEqual([]);
    expect(editor.getHTML()).toBe(loaded);
  });
});

import { TableKit } from "@tiptap/extension-table";
import { StarterKit } from "@tiptap/starter-kit";

/**
 * Everything an engine article can contain (spec v1.1 §11 neutral form): h2–h4, lists, links, emphasis, quotes, tables.
 * No trailing node: it appends an empty paragraph on the first click, which would mark an article that was only read as edited.
 */
export const editorExtensions = [
  StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false, autolink: false }, trailingNode: false }),
  TableKit,
];

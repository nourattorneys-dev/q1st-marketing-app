import { Image } from "@tiptap/extension-image";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import { StarterKit } from "@tiptap/starter-kit";

/**
 * Everything an engine article can contain (spec v1.1 §11 neutral form): headings, lists, links, emphasis, quotes, tables,
 * images, plus footnote-style superscript and subscript. Anything else stays read-only (see lostElements).
 * Links keep their own target/rel (the default adds target="_blank" rel="nofollow…" to every link, internal ones too).
 * No trailing node: it appends an empty paragraph on the first click, which would mark an article that was only read as edited.
 */
export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
    link: { openOnClick: false, autolink: false, HTMLAttributes: { target: null, rel: null } },
    trailingNode: false,
  }),
  TableKit,
  Image,
  Superscript,
  Subscript,
];

import type { Post } from "../schemas";

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Inline HTML to Markdown: links, bold and italic; any other tag is dropped. */
function inline(html: string): string {
  return decodeEntities(
    html
      .replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, "[$2]($1)")
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, "**$2**")
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/g, "_$2_")
      .replace(/<[^>]+>/g, ""),
  ).trim();
}

const listItems = (html: string) => [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => inline(match[1]));

function tableToMarkdown(table: string): string {
  const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) => inline(cell[1])));
  const [head, ...body] = rows;
  if (!head) return "";
  return `\n\n| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${body.map((row) => `| ${row.join(" | ")} |`).join("\n")}\n\n`;
}

/** The engine's neutral article HTML (spec v1.1 §11) as Markdown. */
export function htmlToMarkdown(html: string): string {
  return html
    .replace(/<table>[\s\S]*?<\/table>/g, (table) => tableToMarkdown(table))
    .replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, level: string, text: string) => `\n\n${"#".repeat(Number(level))} ${inline(text)}\n\n`)
    .replace(/<blockquote>([\s\S]*?)<\/blockquote>/g, (_, text: string) => `\n\n> ${inline(text)}\n\n`)
    .replace(/<ul>([\s\S]*?)<\/ul>/g, (_, items: string) => `\n\n${listItems(items).map((item) => `- ${item}`).join("\n")}\n\n`)
    .replace(/<ol>([\s\S]*?)<\/ol>/g, (_, items: string) => `\n\n${listItems(items).map((item, i) => `${i + 1}. ${item}`).join("\n")}\n\n`)
    .replace(/<p>([\s\S]*?)<\/p>/g, (_, text: string) => `\n\n${inline(text)}\n\n`)
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** export.html: a standalone page in the article's language and direction. */
export function exportHtml(post: Post): string {
  const dir = post.language === "ar" ? "rtl" : "ltr";
  const description = post.metaDescription ? `<meta name="description" content="${escapeHtml(post.metaDescription)}">` : "";
  const standfirst = post.subtitle ? `<p><em>${escapeHtml(post.subtitle)}</em></p>` : "";
  const body = post.kind === "blog" ? (post.content ?? "") : `<p>${escapeHtml(post.content ?? "")}</p>`;
  return (
    `<!doctype html><html lang="${post.language}" dir="${dir}"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(post.metaTitle ?? post.title)}</title>${description}</head>` +
    `<body><h1>${escapeHtml(post.title)}</h1>${standfirst}${body}</body></html>`
  );
}

/** export.md: the title, standfirst, body and hashtags as Markdown. */
export function exportMarkdown(post: Post): string {
  const lines = [`# ${post.title}`];
  if (post.subtitle) lines.push("", `_${post.subtitle}_`);
  lines.push("", post.kind === "blog" ? htmlToMarkdown(post.content ?? "") : (post.content ?? ""));
  if (post.hashtags.length > 0) lines.push("", post.hashtags.join(" "));
  return `${lines.join("\n").trim()}\n`;
}

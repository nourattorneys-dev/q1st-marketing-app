function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** A draft's title from a keyword: "Shareholder deadlock uae: what you need to know". */
export function topicFor(phrase: string, language: string): string {
  if (language === "ar") return `${phrase}: ما تحتاج إلى معرفته`;
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}: what you need to know`;
}

/** A topic idea from a keyword (POST …/keywords/topics). */
export function ideaTitleFor(phrase: string, language: string): string {
  return language === "ar" ? `ما يجب معرفته عن ${phrase}` : `What to know about ${phrase}`;
}

/** Keywords the mock "AI" proposes, per language. */
export const PROPOSALS: Record<string, string[]> = {
  en: ["labour court claims dubai", "wrongful termination compensation uae", "non-compete clause uae"],
  ar: ["دعوى عمالية في دبي", "تعويض الفصل التعسفي", "شرط عدم المنافسة"],
};

/**
 * The mock "AI" text. English and Arabic articles have the same structure (h2, p, h2, p), so a pair drafted in
 * both languages always matches (spec v1.1 §11).
 */
export function draftedContent(topic: string, kind: string, language: string): string {
  const arabic = language === "ar";
  if (kind !== "blog") return arabic ? `${topic}: ثلاث نقاط للتحقق منها قبل أن تتصرف.` : `${topic}: three things to check before you act.`;
  const title = escapeHtml(topic);
  return arabic
    ? `<h2>${title}</h2><p>تشرح هذه المسودة الموضوع بلغة واضحة مع النصوص القانونية التي يستند إليها.</p><h2>الخطوات التالية</h2><p>تحدّث إلى مستشار قبل أن تتخذ أي إجراء.</p>`
    : `<h2>${title}</h2><p>This draft explains the topic in plain language, with the law it relies on.</p><h2>What to do next</h2><p>Speak to an adviser before you act on it.</p>`;
}

/** Anything that isn't a letter, digit or underscore, in any script. */
const NOT_TAG = /[^\p{L}\p{N}_]+/gu;

/** One hashtag: '#' and then letters, digits or '_' in any script; null when nothing is left. */
export function toHashtag(word: string): string | null {
  const body = word.replace(/^#+/, "").replace(NOT_TAG, "");
  return body ? `#${body}` : null;
}

/** "dubai labour, #DubaiLaw،#عقارات_دبي" → four tags: split on spaces and commas (the Arabic comma too). */
export function parseHashtags(text: string): string[] {
  return text
    .split(/[\s,،]+/u)
    .map(toHashtag)
    .filter((tag): tag is string => tag !== null);
}

/** Adds tags, keeping each once, ignoring case; the first spelling stays. */
export function withHashtags(current: string[], added: string[]): string[] {
  const seen = new Set(current.map((tag) => tag.toLowerCase()));
  const next = [...current];
  for (const tag of added) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(tag);
  }
  return next;
}

/** The caption as it will be posted: the text, a blank line, then the hashtags. */
export function captionOf(content: string, hashtags: string[]): string {
  const text = content.trim();
  const tags = hashtags.join(" ");
  return text && tags ? `${text}\n\n${tags}` : text || tags;
}

/** Characters as people count them (an emoji is one), not UTF-16 units. */
export const captionLength = (caption: string) => [...caption].length;

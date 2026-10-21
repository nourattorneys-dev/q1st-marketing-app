/** How two phrases are compared: trimmed, single spaces, lower case ("Labour  Court" is "labour court"). */
export const normalizePhrase = (phrase: string) => phrase.trim().replace(/\s+/g, " ").toLowerCase();

/** "a, b\nc" → ["a", "b", "c"] (spec v1.1 §6: comma or line separated); spaces tidied, empties and repeats dropped. */
export function parsePhrases(text: string): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const part of text.split(/[,،\n]/)) {
    const phrase = part.trim().replace(/\s+/g, " ");
    const key = normalizePhrase(phrase);
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    phrases.push(phrase);
  }
  return phrases;
}

/** The phrases the engine didn't add because they already existed (spec v1.1 §7: duplicates are skipped and listed). */
export function skippedPhrases(sent: string[], created: { phrase: string }[]): string[] {
  const added = new Set(created.map((keyword) => normalizePhrase(keyword.phrase)));
  return sent.filter((phrase) => !added.has(normalizePhrase(phrase)));
}

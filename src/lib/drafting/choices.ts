/**
 * Drafting language choices (spec v1.1 §6: en, ar or both): the site's languages from /meta, plus "both" when there are
 * several. An article (kind "blog") is always written in every language of the site, as one linked pair that is
 * published together, so it has the one choice "both".
 */
export function draftLanguageOptions(languages: string[], kind?: string): string[] {
  if (languages.length < 2) return [...languages];
  return kind === "blog" ? ["both"] : [...languages, "both"];
}

/** Where a new draft can go: an article to the website, a social post to the social platforms (from /meta.platforms). */
export function platformsFor(kind: string, platforms: string[]): string[] {
  return kind === "blog" ? platforms.filter((platform) => platform === "website") : platforms.filter((platform) => platform !== "website");
}

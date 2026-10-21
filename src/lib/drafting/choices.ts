/** Drafting language choices (spec v1.1 §6: en, ar or both): the site's languages from /meta, plus "both" when there are several. */
export function draftLanguageOptions(languages: string[]): string[] {
  return languages.length > 1 ? [...languages, "both"] : [...languages];
}

/** Where a new draft can go: an article to the website, a social post to the social platforms (from /meta.platforms). */
export function platformsFor(kind: string, platforms: string[]): string[] {
  return kind === "blog" ? platforms.filter((platform) => platform === "website") : platforms.filter((platform) => platform !== "website");
}

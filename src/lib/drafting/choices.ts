/** Drafting language choices (spec v1.1 §6: en, ar or both): the site's languages from /meta, plus "both" when there are several. */
export function draftLanguageOptions(languages: string[]): string[] {
  return languages.length > 1 ? [...languages, "both"] : [...languages];
}

import { arSA } from "@clerk/localizations";
import { describe, expect, it } from "vitest";
import { clerkLocalizationFor } from "@/lib/auth/clerk-localization";

const ARABIC = /[\u0600-\u06FF]/;

describe("Clerk's screens in the reader's language (M4b follow-up; Review Focus 3)", () => {
  it("gives Clerk Arabic on /ar and its own English otherwise", () => {
    const ar = clerkLocalizationFor("ar");
    expect(ar?.signIn?.start?.title).toBe(arSA.signIn?.start?.title);
    expect(clerkLocalizationFor("en")).toBeUndefined();
  });

  it("fills in what Clerk's Arabic leaves in English at sign-in: placeholders, wrong password or code, the title, dates (final review)", () => {
    const ar = clerkLocalizationFor("ar");
    const shown = [
      ar?.formFieldInputPlaceholder__emailAddress,
      ar?.formFieldInputPlaceholder__password,
      ar?.signIn?.start?.titleCombined,
      ar?.unstable__errors?.form_password_incorrect,
      ar?.unstable__errors?.form_code_incorrect,
      ar?.unstable__errors?.form_param_nil,
      ar?.unstable__errors?.form_param_format_invalid,
      ar?.unstable__errors?.form_password_length_too_short,
    ];
    for (const text of shown) expect(text).toMatch(ARABIC);
    expect(JSON.stringify(ar?.dates)).not.toContain("en-US");
  });
});

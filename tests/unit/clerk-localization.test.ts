import { arSA } from "@clerk/localizations";
import { describe, expect, it } from "vitest";
import { clerkLocalizationFor } from "@/lib/auth/clerk-localization";

describe("Clerk's screens in the reader's language (M4b follow-up; Review Focus 3)", () => {
  it("gives Clerk Arabic on /ar and its own English otherwise", () => {
    expect(clerkLocalizationFor("ar")).toBe(arSA);
    expect(clerkLocalizationFor("en")).toBeUndefined();
  });
});


import { describe, expect, it } from "vitest";
import { seedSeo } from "@/lib/engine/mock/settings-fixtures";
import { readProposal, toSeoForm, toSeoUpdate, withProposal } from "@/lib/settings/seo-form";

describe("the SEO form (spec v1.1 §4 SeoSettings)", () => {
  it("turns the profile into a form and back, leaving out the uploaded picture", () => {
    const seed = seedSeo();
    const { ogImageUploaded, ...rest } = seed;
    expect(ogImageUploaded).toBeNull();
    expect(toSeoUpdate(toSeoForm(seed), seed.version)).toEqual(rest);
  });

  it("lists take commas, Arabic commas or new lines; empty text is sent as null", () => {
    const form = { ...toSeoForm(seedSeo()), focusKeywords: "استشارات قانونية دبي، uae labour law\ncontract review uae", tone: "   " };
    expect(toSeoUpdate(form, 3)).toMatchObject({ focusKeywords: ["استشارات قانونية دبي", "uae labour law", "contract review uae"], tone: null });
  });

  it("an AI proposal fills focus keywords and the call to action; a result it can't read changes nothing", () => {
    const form = toSeoForm(seedSeo());
    const proposal = readProposal({ focusKeywords: ["legal consultancy dubai", "uae labour law advice"], cta: "Book a consultation with Fakher & Co" });
    expect(proposal && withProposal(form, proposal)).toMatchObject({ focusKeywords: "legal consultancy dubai, uae labour law advice", cta: "Book a consultation with Fakher & Co" });
    expect([readProposal({ nothing: true }), readProposal("text"), readProposal({ cta: 5 })]).toEqual([null, null, null]);
  });
});

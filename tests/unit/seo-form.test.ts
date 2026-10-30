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

  it("Fill from my website fills only the empty fields, any of the profile's; what a person typed stays", () => {
    const form = { ...toSeoForm(seedSeo()), cta: "", services: "", audience: "", tone: "my own tone" };
    const proposal = readProposal({
      services: ["Employment law", "Company law"],
      audience: "UAE companies",
      cta: "Book a consultation with Fakher & Co",
      tone: "formal",
      focusKeywords: ["something else"],
      pagesRead: 6,
    });
    const next = proposal && withProposal(form, proposal);
    expect(next?.form).toMatchObject({ services: "Employment law, Company law", audience: "UAE companies", cta: "Book a consultation with Fakher & Co", tone: "my own tone" });
    expect(next?.form.focusKeywords).toBe(form.focusKeywords);
    expect(next?.filled.sort()).toEqual(["audience", "cta", "services"]);
    expect([readProposal({ nothing: true }), readProposal("text"), readProposal({ cta: 5 })]).toEqual([null, null, null]);
  });
});

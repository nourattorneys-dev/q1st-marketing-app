import { describe, expect, it } from "vitest";
import { needsPhoto } from "@/lib/posts/rules";
import { captionLength, captionOf, parseHashtags, withHashtags } from "@/lib/posts/social";

describe("hashtags (spec v1.1 §4: social posts only)", () => {
  it("turns typed words into hashtags, splitting on spaces and commas, the Arabic one too (Review Focus 5)", () => {
    expect(parseHashtags("dubai labour, #DubaiLaw،#عقارات_دبي")).toEqual(["#dubai", "#labour", "#DubaiLaw", "#عقارات_دبي"]);
  });

  it("drops punctuation and empty tags", () => {
    expect(parseHashtags("#UAE-Labour ## , !!")).toEqual(["#UAELabour"]);
  });

  it("keeps each tag once, ignoring case, and keeps the first spelling", () => {
    expect(withHashtags(["#Dubai"], ["#dubai", "#OffPlan", "#offplan"])).toEqual(["#Dubai", "#OffPlan"]);
  });
});

describe("the caption", () => {
  it("is the text, a blank line, then the hashtags", () => {
    expect([captionOf(" Short update. ", ["#UAELabourLaw", "#Dubai"]), captionOf("", ["#Dubai"]), captionOf("Text", [])]).toEqual([
      "Short update.\n\n#UAELabourLaw #Dubai",
      "#Dubai",
      "Text",
    ]);
  });

  it("counts characters as people do: an emoji or an Arabic letter is one", () => {
    expect([captionLength("مرحبا 👋"), captionLength("Short update.\n\n#UAELabourLaw #Dubai")]).toEqual([7, 35]);
  });
});

describe("needsPhoto (spec v1.1 §4 Post.image; Review Focus 4)", () => {
  it("an Instagram post without a photo needs one; with one, or on another platform, it doesn't", () => {
    expect([
      needsPhoto({ platform: "instagram", image: null }),
      needsPhoto({ platform: "instagram", image: { url: "https://x/p.jpg" } }),
      needsPhoto({ platform: "linkedin", image: null }),
    ]).toEqual([true, false, false]);
  });
});

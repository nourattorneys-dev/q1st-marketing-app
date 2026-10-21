import { describe, expect, it } from "vitest";
import { changedFields, toUpdate, type EditableFields } from "@/lib/editor/changed-fields";

const base: EditableFields = {
  title: "T",
  subtitle: null,
  slug: "t",
  metaTitle: null,
  metaDescription: "D",
  keywords: ["a"],
  content: "<p>x</p>",
  hashtags: [],
  section: "labour-law",
  image: null,
};

describe("changedFields", () => {
  it("lists the fields that differ", () => {
    expect(changedFields(base, { ...base, title: "U", keywords: ["a", "b"] })).toEqual(["title", "keywords"]);
  });

  it("treats empty text and null as the same", () => {
    expect(changedFields({ ...base, subtitle: "" }, base)).toEqual([]);
  });
});

describe("toUpdate", () => {
  it("sends the photo's alt text and credit only when there is a photo", () => {
    expect(toUpdate(base, 4)).not.toHaveProperty("image");
    expect(toUpdate({ ...base, image: { alt: "Court", credit: null } }, 4)).toMatchObject({ title: "T", image: { alt: "Court", credit: null }, version: 4 });
  });
});

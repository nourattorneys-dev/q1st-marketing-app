import { describe, expect, it } from "vitest";
import { changedFields, type EditableFields } from "@/lib/editor/changed-fields";

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
};

describe("changedFields", () => {
  it("lists the fields that differ", () => {
    expect(changedFields(base, { ...base, title: "U", keywords: ["a", "b"] })).toEqual(["title", "keywords"]);
  });

  it("treats empty text and null as the same", () => {
    expect(changedFields({ ...base, subtitle: "" }, base)).toEqual([]);
  });
});

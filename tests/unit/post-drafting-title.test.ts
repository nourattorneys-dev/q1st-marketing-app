import { describe, expect, it } from "vitest";
import { PostSchema } from "@/lib/engine/schemas";

const base = {
  id: "p_1", kind: "blog", platform: "website", language: "ar", status: "drafting", topic: "عقود تجارية", keywords: [],
  hashtags: [], sources: [], linkSuggestions: [], findings: [], createdAt: "2026-11-11T23:56:07Z", updatedAt: "2026-11-11T23:56:07Z",
  version: 1, actions: [],
};

describe("a post the AI is still writing", () => {
  it("is kept while it has no title yet, shown by its topic (a translation in progress)", () => {
    const r = PostSchema.safeParse({ ...base, title: null });
    expect(r.success && r.data.title).toBe("عقود تجارية");
  });
  it("is kept with neither title nor topic (an empty title, not a skipped item)", () => {
    const r = PostSchema.safeParse({ ...base, language: "en", title: undefined, topic: null });
    expect(r.success && r.data.title).toBe("");
  });
  it("keeps its own title once written", () => {
    const r = PostSchema.safeParse({ ...base, status: "pending", title: "Commercial contracts" });
    expect(r.success && r.data.title).toBe("Commercial contracts");
  });
});

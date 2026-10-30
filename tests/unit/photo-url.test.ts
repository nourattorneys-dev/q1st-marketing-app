import { describe, expect, it } from "vitest";
import { PostSummarySchema } from "@/lib/engine/schemas";

const base = { id: "p_64ba01212d7d0304", kind: "blog", platform: "website", language: "ar", status: "pending", title: "t", updatedAt: "2026-10-31T00:00:00Z", actions: [] };
const parse = (image: unknown) => PostSummarySchema.safeParse({ ...base, image });

describe("a post's photo address", () => {
  it("a photo the engine keeps is shown through the app, keeping its version", () => {
    const r = parse({ url: "/api/v1/sites/site_1/media/p_64ba01212d7d0304?v=3", alt: "a" });
    expect(r.success && r.data.image?.url).toBe("/api/photo/p_64ba01212d7d0304?v=3");
  });
  it("an outside address is left as it is", () => {
    const r = parse({ url: "https://images.pexels.com/photos/1/a.jpg", alt: null });
    expect(r.success && r.data.image?.url).toBe("https://images.pexels.com/photos/1/a.jpg");
  });
  it("no photo stays no photo", () => {
    const r = parse(null);
    expect(r.success && r.data.image).toBeNull();
  });
});

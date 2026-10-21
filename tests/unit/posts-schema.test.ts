import { describe, expect, it } from "vitest";
import { EngineError } from "@/lib/engine/errors";
import { tryEngine } from "@/lib/engine/result";
import { PostSchema, PostUpdateSchema } from "@/lib/engine/schemas";
import { approvalMode, findingCounts, isOverridable } from "@/lib/posts/rules";

const minimal = {
  id: "p_1",
  kind: "blog",
  platform: "website",
  language: "en",
  status: "pending",
  title: "A title",
  createdAt: "2026-10-21T09:00:00+04:00",
  updatedAt: "2026-10-21T09:00:00+04:00",
  version: 3,
};

describe("PostSchema", () => {
  it("defaults missing lists to empty arrays", () => {
    const post = PostSchema.parse(minimal);
    expect(post.keywords).toEqual([]);
    expect(post.findings).toEqual([]);
    expect(post.actions).toEqual([]);
    expect(post.content).toBeUndefined();
  });

  it("parses a full post including lock, twin and seo", () => {
    const post = PostSchema.parse({
      ...minimal,
      pairId: "p_2",
      twin: { id: "p_2", language: "ar", status: "pending" },
      content: "<p>Body</p>",
      findings: [{ level: "critical", code: "meta_description_length", ref: "§3.2", message: "Too long" }],
      seo: { score: 85, checks: [] },
      lock: { by: "omar@example.com", at: "2026-10-21T09:00:00+04:00", expiresAt: "2026-10-21T09:15:00+04:00" },
      actions: ["edit", "approve"],
    });
    expect(post.twin?.language).toBe("ar");
    expect(post.lock?.by).toBe("omar@example.com");
    expect(post.actions).toEqual(["edit", "approve"]);
  });
});

describe("PostUpdateSchema", () => {
  it("accepts a complete update and rejects a missing version", () => {
    const update = {
      title: "T",
      subtitle: null,
      slug: "t",
      metaTitle: null,
      metaDescription: null,
      keywords: [],
      content: "<p>x</p>",
      hashtags: [],
      section: null,
      version: 2,
    };
    expect(PostUpdateSchema.safeParse(update).success).toBe(true);
    const withoutVersion = Object.fromEntries(Object.entries(update).filter(([key]) => key !== "version"));
    expect(PostUpdateSchema.safeParse(withoutVersion).success).toBe(false);
  });
});

describe("finding rules", () => {
  const critical = { level: "critical", message: "x" };
  const locked = { level: "critical", overridable: false, message: "structure" };
  const warn = { level: "warn", message: "w" };
  const human = { level: "human", message: "h" };

  it("treats a missing overridable flag as overridable", () => {
    expect(isOverridable(critical)).toBe(true);
    expect(isOverridable(locked)).toBe(false);
  });

  it("counts findings by level", () => {
    expect(findingCounts({ findings: [critical, warn, warn, human] })).toEqual({ critical: 1, warn: 2, human: 1 });
  });

  it("decides how approval works", () => {
    expect(approvalMode([warn, human])).toBe("direct");
    expect(approvalMode([critical, warn])).toBe("override");
    expect(approvalMode([critical, locked])).toBe("blocked");
  });
});

describe("tryEngine failures", () => {
  it("keep fields and details for the UI", async () => {
    const result = await tryEngine(async () => {
      throw new EngineError({
        status: 409,
        code: "locked",
        message: "Being edited",
        details: { lockedBy: "omar@example.com" },
        fields: { title: "Too long" },
      });
    });
    expect(result).toEqual({
      ok: false,
      error: { status: 409, code: "locked", message: "Being edited", details: { lockedBy: "omar@example.com" }, fields: { title: "Too long" } },
    });
  });
});

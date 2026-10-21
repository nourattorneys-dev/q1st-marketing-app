import { beforeEach, describe, expect, it, vi } from "vitest";

const engine = { deletePost: vi.fn(), job: vi.fn(), post: vi.fn() };
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requirePermission: vi.fn(async () => ({ email: "reviewer@example.com" })) }));
vi.mock("@/lib/engine", () => ({ getEngine: async () => engine }));

const { deletePostAction, jobAction, loadPostAction } = await import("@/app/[locale]/(app)/review/actions");

beforeEach(() => vi.clearAllMocks());

describe("post actions accept only well-formed ids (final review: path traversal)", () => {
  it.each(["..", ".", "a/b", "p_201?x=1", "%2e%2e", " "])("refuses the post id %j without calling the engine", async (postId) => {
    const result = await deletePostAction({ locale: "en", postId, idempotencyKey: "key-12345678" });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(engine.deletePost).not.toHaveBeenCalled();
  });

  it("refuses a malformed job id", async () => {
    expect(await jobAction({ locale: "en", jobId: ".." })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(engine.job).not.toHaveBeenCalled();
  });

  it("refuses an unknown locale", async () => {
    expect(await loadPostAction({ locale: "xx", postId: "p_201" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(engine.post).not.toHaveBeenCalled();
  });

  it("passes a normal id through", async () => {
    engine.post.mockResolvedValue({ id: "p_201" });
    expect(await loadPostAction({ locale: "en", postId: "p_201" })).toMatchObject({ ok: true });
  });
});

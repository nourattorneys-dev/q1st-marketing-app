import { beforeEach, describe, expect, it, vi } from "vitest";

const engine = {
  deletePost: vi.fn(),
  job: vi.fn(),
  post: vi.fn(),
  publishPost: vi.fn(),
  holdPost: vi.fn(),
  exportPost: vi.fn(),
  searchPhotos: vi.fn(),
  uploadPhoto: vi.fn(),
};
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requirePermission: vi.fn(async () => ({ email: "reviewer@example.com" })) }));
vi.mock("@/lib/engine", () => ({ getEngine: async () => engine }));

const { deletePostAction, exportPostAction, holdPostAction, jobAction, loadPostAction, publishPostAction } = await import(
  "@/app/[locale]/(app)/review/actions"
);
const { searchPhotosAction, uploadPhotoAction } = await import("@/app/[locale]/(app)/review/photo-actions");

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

function uploadForm(fields: Record<string, string>, file?: File): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set("file", file);
  return form;
}

describe("M2b actions validate their input too", () => {
  it("refuses a malformed id for publish and hold without calling the engine", async () => {
    expect(await publishPostAction({ locale: "en", postId: "..", idempotencyKey: "key-12345678" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await holdPostAction({ locale: "en", postId: "p_1/x", hold: true, idempotencyKey: "key-12345678" })).toMatchObject({ ok: false });
    expect(engine.publishPost).not.toHaveBeenCalled();
    expect(engine.holdPost).not.toHaveBeenCalled();
  });

  it("refuses an upload with a bad post id or no file", async () => {
    const png = new File(["x"], "a.png", { type: "image/png" });
    expect(await uploadPhotoAction(uploadForm({ locale: "en", postId: "..", idempotencyKey: "key-12345678" }, png))).toMatchObject({ ok: false });
    expect(await uploadPhotoAction(uploadForm({ locale: "en", postId: "p_201", idempotencyKey: "key-12345678" }))).toMatchObject({ ok: false });
    expect(engine.uploadPhoto).not.toHaveBeenCalled();
  });

  it("passes a well-formed upload to the engine with who is acting and the key", async () => {
    engine.uploadPhoto.mockResolvedValue({ url: "data:image/png;base64,eA==", source: "upload" });
    const png = new File(["x"], "a.png", { type: "image/png" });
    const result = await uploadPhotoAction(uploadForm({ locale: "en", postId: "p_201", idempotencyKey: "key-12345678", alt: "Court" }, png));
    expect(result).toMatchObject({ ok: true, data: { source: "upload" } });
    expect(engine.uploadPhoto).toHaveBeenCalledWith(
      "p_201",
      expect.objectContaining({ alt: "Court" }),
      expect.objectContaining({ actingUser: "reviewer@example.com", idempotencyKey: "key-12345678" }),
    );
  });

  it("exports only HTML or Markdown", async () => {
    expect(await exportPostAction({ locale: "en", postId: "p_201", format: "pdf" as "html" })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(engine.exportPost).not.toHaveBeenCalled();
  });

  it("searches photos only for actual words", async () => {
    expect(await searchPhotosAction({ locale: "en", query: "   ", page: 1 })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(engine.searchPhotos).not.toHaveBeenCalled();
  });
});

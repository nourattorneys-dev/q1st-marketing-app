import { describe, expect, it } from "vitest";
import { UPLOAD_MAX_BYTES, uploadLimit } from "@/lib/uploads";

describe("uploadLimit (M2b follow-up: Vercel refuses request bodies over 4.5 MB)", () => {
  it("never allows more than fits through Vercel, and keeps a smaller engine limit", () => {
    expect(UPLOAD_MAX_BYTES).toBe(4 * 1_048_576);
    expect(uploadLimit(5 * 1_048_576)).toBe(UPLOAD_MAX_BYTES);
    expect(uploadLimit(3_000_000)).toBe(3_000_000);
  });
});


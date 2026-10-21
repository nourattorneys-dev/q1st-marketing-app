import { describe, expect, it } from "vitest";
import { afterAttempt, fingerprintOf, keyForAttempt } from "@/lib/actions/idempotency";

function minter() {
  let n = 0;
  return () => `key-${++n}`;
}

describe("idempotency keys (spec v1.1 §2; Review Focus 1)", () => {
  it("reuses the key when the same request got no answer", () => {
    const mint = minter();
    const first = keyForAttempt(null, "publish p_1", mint);
    expect(keyForAttempt(afterAttempt(first.memory, false), "publish p_1", mint).key).toBe(first.key);
  });

  it("uses a new key after any answer, even a refusal", () => {
    const mint = minter();
    const first = keyForAttempt(null, "publish p_1", mint);
    expect(keyForAttempt(afterAttempt(first.memory, true), "publish p_1", mint).key).not.toBe(first.key);
  });

  it("uses a new key when the request changed, even with no answer (so no idempotency_mismatch)", () => {
    const mint = minter();
    const first = keyForAttempt(null, fingerprintOf({ postId: "p_1", note: "Shorter" }), mint);
    const edited = keyForAttempt(afterAttempt(first.memory, false), fingerprintOf({ postId: "p_1", note: "Shorter introduction" }), mint);
    expect(edited.key).not.toBe(first.key);
  });

  it("tells files apart by name, type, size and date", () => {
    const file = (body: string) => new File([body], "a.png", { type: "image/png", lastModified: 1 });
    expect(fingerprintOf({ file: file("aa") })).toBe(fingerprintOf({ file: file("aa") }));
    expect(fingerprintOf({ file: file("aa") })).not.toBe(fingerprintOf({ file: file("aaa") }));
  });
});

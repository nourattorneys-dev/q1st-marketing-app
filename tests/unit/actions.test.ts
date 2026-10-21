import { describe, expect, it } from "vitest";
import { INVALID, NETWORK_FAILURE, shouldReuseKey } from "@/lib/actions/result";
import { engineNoticeKey, failureNoticeKey } from "@/lib/engine/notice";

describe("shouldReuseKey", () => {
  it("reuses the key only when no answer arrived (spec v1.1 §2)", () => {
    expect(shouldReuseKey(NETWORK_FAILURE)).toBe(true);
    expect(shouldReuseKey({ status: 0, code: "network_error", message: "x" })).toBe(true);
    expect(shouldReuseKey({ status: 422, code: "framework_blocked", message: "x" })).toBe(false);
    expect(shouldReuseKey({ status: 502, code: "publish_failed", message: "x" })).toBe(false);
  });
});

describe("engineNoticeKey", () => {
  it("translates the codes the spec gives a fixed meaning", () => {
    expect(engineNoticeKey("engine_busy")).toBe("engineBusy");
    expect(engineNoticeKey("not_found")).toBe("notFound");
    expect(engineNoticeKey("framework_blocked")).toBeNull();
  });
});

describe("failureNoticeKey (M2a/M4b follow-up: no English \"Invalid request.\" in Arabic)", () => {
  it("translates the dashboard's own refusal, and leaves the engine's input errors their own message", () => {
    expect(failureNoticeKey(INVALID.error)).toBe("invalidRequest");
    expect(failureNoticeKey({ code: "invalid_input" })).toBeNull();
    expect(failureNoticeKey({ code: "engine_busy" })).toBe("engineBusy");
  });
});

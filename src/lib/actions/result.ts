import type { EngineFailure, EngineResult } from "@/lib/engine/result";

export type ActionResult<T> = EngineResult<T>;

/** Our own server (or the engine) gave no answer: the request may have gone through, so a retry must reuse the key. */
export const NETWORK_FAILURE: EngineFailure = {
  status: 0,
  code: "network_error",
  message: "The server could not be reached. Try again shortly.",
};

export function shouldReuseKey(error: EngineFailure): boolean {
  return error.code === "network_error";
}

/** The dashboard's own input check refused a request. It's marked, so the person sees it translated (Errors.invalidRequest). */
export const INVALID = { ok: false as const, error: { status: 400, code: "invalid_input", message: "Invalid request.", details: { source: "dashboard" } } };

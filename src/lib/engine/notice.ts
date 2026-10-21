export type NoticeKey = "serviceUnavailable" | "engineUnreachable" | "engineInvalid" | "engineBusy" | "notFound" | "invalidRequest";

/** Which translated message to show for an engine failure; null means show the engine's own message as it is. */
export function engineNoticeKey(code: string): NoticeKey | null {
  switch (code) {
    case "unauthorized":
      return "serviceUnavailable";
    case "network_error":
    case "engine_unavailable":
      return "engineUnreachable";
    case "invalid_response":
      return "engineInvalid";
    case "engine_busy":
      return "engineBusy";
    case "not_found":
      return "notFound";
    default:
      return null;
  }
}

/** The same, plus the dashboard's own input refusal (INVALID), whose English message never shows. */
export function failureNoticeKey(error: { code: string; details?: Record<string, unknown> }): NoticeKey | null {
  if (error.code === "invalid_input" && error.details?.source === "dashboard") return "invalidRequest";
  return engineNoticeKey(error.code);
}

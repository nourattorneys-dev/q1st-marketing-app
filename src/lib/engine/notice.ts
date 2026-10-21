export type NoticeKey = "serviceUnavailable" | "engineUnreachable" | "engineInvalid" | "engineBusy" | "notFound";

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

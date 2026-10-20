export type NoticeKey = "serviceUnavailable" | "engineUnreachable" | "engineInvalid";

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
    default:
      return null;
  }
}

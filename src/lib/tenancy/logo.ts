import type { ClientLogo } from "@/lib/accounts/store";

/** Image kinds a logo may be. An SVG is only ever shown through <img>, and served with a policy that runs nothing. */
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

export type LogoLimits = { maxBytes: number; timeoutMs: number };
export type FetchLogo = (url: string) => Promise<ClientLogo | { problem: string }>;

/**
 * P2: fetches a client's logo once, from the https address staff gave, so the app keeps its own copy. Refused: not
 * https, no answer in time, not an image of an allowed kind, or larger than the limit (each limit is a setting).
 */
export function logoFetcher(limits: LogoLimits, fetchImpl: typeof fetch = fetch): FetchLogo {
  return async (url) => {
    if (!URL.canParse(url) || new URL(url).protocol !== "https:") return { problem: "The logo address must start with https://." };
    let response: Response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(limits.timeoutMs), redirect: "follow" });
    } catch {
      return { problem: "The logo address didn't answer." };
    }
    if (!response.ok) return { problem: `The logo address answered ${response.status}.` };
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!(LOGO_TYPES as readonly string[]).includes(contentType)) return { problem: "The logo must be a PNG, JPEG, WebP or SVG image." };
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > limits.maxBytes) return { problem: `The logo is larger than ${Math.round(limits.maxBytes / 1024)} KB.` };
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length === 0) return { problem: "The logo address sent an empty file." };
    if (data.length > limits.maxBytes) return { problem: `The logo is larger than ${Math.round(limits.maxBytes / 1024)} KB.` };
    return { contentType, data, updatedAt: new Date() };
  };
}

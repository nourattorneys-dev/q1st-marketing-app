const HOST = /^[A-Za-z0-9.-]+(:\d+)?$/;
const isLocal = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1";

/** This portal's own address, from the request (Vercel sets x-forwarded-host and x-forwarded-proto); null if it isn't a plain host. */
export function originOf(headers: Headers): string | null {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  if (!HOST.test(host)) return null;
  const forwarded = (headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const protocol = forwarded === "http" || forwarded === "https" ? forwarded : isLocal(host.split(":")[0]) ? "http" : "https";
  return `${protocol}://${host}`;
}

/** The engine's sign-in address is followed only if it's https (or http on this machine), so nothing like `javascript:` runs here. */
export function safeRedirectUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || (url.protocol === "http:" && isLocal(url.hostname))) return url.href;
    return null;
  } catch {
    return null;
  }
}

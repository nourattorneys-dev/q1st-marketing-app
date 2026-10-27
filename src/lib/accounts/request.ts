import { isIP } from "node:net";

/**
 * The visitor's internet address, for the per-address sign-in limit and the sign-in log. On the cPanel host Passenger
 * adds its own X-Forwarded-For line, after any the browser sent, carrying Apache's REMOTE_ADDR; Node joins repeated
 * lines with ", ", so only the last entry is trusted. Null when there's none, or it's this machine (a local run, where
 * every visitor would share one address and the limit would lock everyone at once).
 */
export function clientAddress(forwardedFor: string | null): string | null {
  const last = forwardedFor?.split(",").at(-1)?.trim() ?? "";
  const address = last.toLowerCase().startsWith("::ffff:") ? last.slice(7) : last;
  if (!isIP(address)) return null;
  if (address === "::1" || address.startsWith("127.")) return null;
  return address;
}

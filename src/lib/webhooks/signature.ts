import { createHmac, timingSafeEqual } from "node:crypto";

/** Spec v1.1 §8: X-Signature is "sha256=" + the hex HMAC-SHA256 of the raw body with the site's webhook secret. */
export function signBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

/** Checks an X-Signature header against the raw body in constant time (design §11). Hex letter case doesn't matter. */
export function verifySignature(body: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(signBody(body, secret), "utf8");
  const given = Buffer.from(header.trim().toLowerCase(), "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

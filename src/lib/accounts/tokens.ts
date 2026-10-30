import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes (256 bits), URL-safe: invitation and reset links, and session cookies. */
export const newToken = (): string => randomBytes(32).toString("base64url");

/** Only this is stored, so a copy of the database holds no working link or session. */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** `usr_…` or `inv_…`: 16 random bytes, URL-safe (22 characters), within the Users page's id rule. */
export const newId = (prefix: "usr" | "inv" | "cli"): string => `${prefix}_${randomBytes(16).toString("base64url")}`;

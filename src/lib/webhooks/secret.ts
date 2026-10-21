import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** The webhook secret at rest (design §11): AES-256-GCM, stored as "v1:" + base64(iv | tag | ciphertext). */
export function encryptSecret(secret: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

/** The secret back; null if another key encrypted it (WEBHOOK_ENCRYPTION_KEY changed) or the text was altered. */
export function decryptSecret(stored: string, key: Buffer): string | null {
  if (!stored.startsWith(`${VERSION}:`)) return null;
  const raw = Buffer.from(stored.slice(VERSION.length + 1), "base64");
  if (raw.length <= IV_BYTES + TAG_BYTES) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, IV_BYTES));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const PROCESS_KEY = Symbol.for("articles-ai.process-key");

/**
 * The key for the webhook secret: WEBHOOK_ENCRYPTION_KEY; with the in-memory store, one that lives as long as the
 * process (as the store does); with Neon and no key, none: the secret can't be kept.
 */
export function secretKeyFor(env: { dbMode: "memory" | "neon"; encryptionKey: Buffer | null }): Buffer | null {
  if (env.encryptionKey) return env.encryptionKey;
  if (env.dbMode !== "memory") return null;
  const holder = globalThis as unknown as Record<symbol, Buffer | undefined>;
  return (holder[PROCESS_KEY] ??= randomBytes(32));
}

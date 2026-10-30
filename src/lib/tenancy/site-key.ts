import { decryptSecret, encryptSecret, secretKeyFor } from "@/lib/webhooks/secret";

/** The key that protects each site's engine key at rest (APP_ENCRYPTION_KEY, else WEBHOOK_ENCRYPTION_KEY; a process key in memory mode). */
export function siteKeyFor(env: { dbMode: "memory" | "postgres"; appEncryptionKey: Buffer | null }): Buffer | null {
  return secretKeyFor({ dbMode: env.dbMode, encryptionKey: env.appEncryptionKey });
}

export function encryptSiteKey(engineKey: string, key: Buffer): string {
  return encryptSecret(engineKey, key);
}

/** The engine key, or null when another key encrypted it. Never logged, never sent to the browser. */
export function decryptSiteKey(keyCipher: string, key: Buffer): string | null {
  return decryptSecret(keyCipher, key);
}

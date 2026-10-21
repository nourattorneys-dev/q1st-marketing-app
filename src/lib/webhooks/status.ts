export const HOOK_PATH = "/api/hooks/marketing";
export const hookUrlFor = (origin: string) => `${origin}${HOOK_PATH}`;

export type WebhookStatus = "off" | "elsewhere" | "secretMissing" | "connected";

/**
 * Off: nothing registered. Elsewhere: registered to another address (another deployment, say). Secret missing:
 * registered here, but this server can't read a secret saved for this address (none stored, another address, or a
 * changed WEBHOOK_ENCRYPTION_KEY). Connected: deliveries to this address can be verified.
 */
export function webhookStatus(registeredUrl: string | null | undefined, storedUrl: string | null, ourUrl: string | null): WebhookStatus {
  if (!registeredUrl) return "off";
  if (!ourUrl || registeredUrl !== ourUrl) return "elsewhere";
  return storedUrl === ourUrl ? "connected" : "secretMissing";
}

import { getStore } from "@/lib/db";
import { servicesEnv } from "@/lib/services-env";
import { knownSite } from "@/lib/tenancy";
import { EnvelopeSchema, EVENT_ID, notificationFor } from "@/lib/webhooks/events";
import { decryptSecret, secretKeyFor } from "@/lib/webhooks/secret";
import { verifySignature } from "@/lib/webhooks/signature";

const MAX_BODY_BYTES = 256 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

/** The envelope's siteId, read before the signature is checked: only used to find which secret to check it with. */
function claimedSite(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    const siteId = parsed && typeof parsed === "object" ? (parsed as { siteId?: unknown }).siteId : null;
    return typeof siteId === "string" && siteId.length > 0 && siteId.length <= 191 ? siteId : null;
  } catch {
    return null;
  }
}

const refuse = (status: number, code: string, message: string) => Response.json({ ok: false, error: { status, code, message } }, { status, headers: NO_STORE });
const accept = (data: Record<string, unknown>) => Response.json({ ok: true, data }, { headers: NO_STORE });

/**
 * POST /api/hooks/marketing: Quantum1st's signed deliveries (spec v1.1 §8; design §4, §11). The signature is checked
 * against the raw body, in constant time, before anything is parsed. A repeated X-Event-Id is acknowledged and ignored.
 * Screens aren't cached (they read the engine when they open), so the only work is recording and queueing emails.
 */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return refuse(413, "too_large", "The delivery is too large.");
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return refuse(413, "too_large", "The delivery is too large.");

  // P1b: the delivery names its site; that site's secret checks the signature. The name is untrusted until then, so an
  // unknown site, a body that names none and a wrong signature all get the same answer.
  const siteId = claimedSite(body);
  const store = siteId && (await knownSite(siteId)) ? getStore(siteId) : null;
  const key = secretKeyFor(servicesEnv());
  const config = store ? await store.webhook() : null;
  const secret = key && config ? decryptSecret(config.secretCipher, key) : null;
  if (!store || !secret || !verifySignature(body, request.headers.get("X-Signature"), secret)) {
    return refuse(401, "invalid_signature", "The signature doesn't match.");
  }

  const eventId = request.headers.get("X-Event-Id") ?? "";
  if (!EVENT_ID.test(eventId)) return refuse(400, "invalid_input", "X-Event-Id is missing or malformed.");
  const envelope = EnvelopeSchema.safeParse(JSON.parse(body));
  if (!envelope.success) return refuse(400, "invalid_input", "The body isn't a webhook delivery.");

  if (await store.hasEvent(eventId)) return accept({ duplicate: true });
  const now = new Date();
  await store.recordEvent({ id: eventId, event: envelope.data.event, receivedAt: now }, notificationFor(eventId, envelope.data, now));
  return accept({ received: true });
}


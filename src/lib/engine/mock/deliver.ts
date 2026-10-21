import { signBody } from "@/lib/webhooks/signature";
import { MOCK_SITE_ID } from "./fixtures";
import type { MockStore } from "./store";

type Send = (url: string, init: RequestInit) => Promise<Response>;

/** Test logins only: the mock engine sends one signed delivery to the address registered with it, as Quantum1st would (spec v1.1 §8). */
export async function deliverMockEvent(store: MockStore, event: string, data: unknown, options: { eventId?: string; fetch?: Send } = {}) {
  const target = store.settings.webhookTarget();
  if (!target) return { delivered: false as const, reason: "no_webhook" as const };
  const eventId = options.eventId ?? `evt_${crypto.randomUUID().replace(/-/g, "")}`;
  const body = JSON.stringify({ event, siteId: MOCK_SITE_ID, at: new Date().toISOString(), data });
  const send: Send = options.fetch ?? ((url, init) => fetch(url, init));
  const response = await send(target.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature": signBody(body, target.secret), "X-Event-Id": eventId },
    body,
  });
  const reply: unknown = await response.json().catch(() => null);
  return { delivered: true as const, eventId, status: response.status, body: reply };
}

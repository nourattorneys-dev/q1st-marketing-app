import { cookies } from "next/headers";
import { z } from "zod";
import { deliverMockEvent } from "@/lib/engine/mock/deliver";
import { MOCK_STORE_COOKIE, mockStoreFor } from "@/lib/engine/mock/registry";
import { serverEnv } from "@/lib/env";
import { EVENT_ID } from "@/lib/webhooks/events";

const Body = z.object({ event: z.string().min(1).max(100), data: z.unknown(), eventId: z.string().regex(EVENT_ID).optional() });

/**
 * Test logins with the mock engine only: the mock engine (this request's mock_store) delivers one signed event to the
 * address registered with it. The e2e suite and local checks use it; 404 anywhere else.
 */
export async function POST(request: Request) {
  const env = serverEnv();
  if (env.authMode !== "mock" || env.engineMode !== "mock") return new Response(null, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, error: { status: 400, code: "invalid_input", message: "Send { event, data, eventId? }." } }, { status: 400 });
  }
  const store = mockStoreFor((await cookies()).get(MOCK_STORE_COOKIE)?.value);
  return Response.json({ ok: true, data: await deliverMockEvent(store, parsed.data.event, parsed.data.data, { eventId: parsed.data.eventId }) });
}

import { connection } from "next/server";
import { getAccountStore, getExclusive, getStore } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { mailerFor } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";
import { ensureTenancy } from "@/lib/tenancy";
import { logoFetcher } from "@/lib/tenancy/logo";
import { provision, ProvisionRequest } from "@/lib/tenancy/provision";
import { siteKeyFor } from "@/lib/tenancy/site-key";
import { verifySignature } from "@/lib/webhooks/signature";

const MAX_BODY_BYTES = 16 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };
const answer = (status: number, code: string, message: string) =>
  Response.json({ ok: false, error: { status, code, message } }, { status, headers: NO_STORE });

/**
 * POST /api/provision (P1c): the staff portal, through the engine, adds or updates a client's site, removes one, or
 * renames a client. Signed like the engine's webhooks, over "<X-Timestamp>.<raw body>" with PROVISION_SECRET; a request
 * whose time is too far from ours is refused, so a captured one can't be replayed later. Every refusal reads the same.
 */
export async function POST(request: Request) {
  await connection();
  const env = servicesEnv();
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return answer(413, "too_large", "The request is too large.");
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return answer(413, "too_large", "The request is too large.");

  const stamp = request.headers.get("X-Timestamp") ?? "";
  const sentAt = /^\d{1,12}$/.test(stamp) ? Number(stamp) * 1000 : NaN;
  const fresh = Number.isFinite(sentAt) && Math.abs(Date.now() - sentAt) <= env.provisionMaxSkewMs;
  if (!env.provisionSecret || !fresh || !verifySignature(`${stamp}.${body}`, request.headers.get("X-Signature"), env.provisionSecret)) {
    return answer(401, "invalid_signature", "The signature doesn't match.");
  }

  let parsed: ReturnType<typeof ProvisionRequest.safeParse>;
  try {
    parsed = ProvisionRequest.safeParse(JSON.parse(body));
  } catch {
    return answer(400, "invalid_input", "The body isn't JSON.");
  }
  if (!parsed.success) return answer(400, "invalid_input", "The request isn't a valid provisioning request.");

  const key = siteKeyFor(env);
  const appUrl = serverEnv().appUrl;
  if (!key || !appUrl) return answer(503, "not_configured", "Set APP_ENCRYPTION_KEY and APP_URL on the app.");
  // The settings-file client first, so the portal's first request links it instead of making a second one.
  await ensureTenancy();
  const outcome = await getExclusive()("articles_ai_provision", () =>
    provision({ accounts: getAccountStore(), storeFor: getStore, mailer: mailerFor(env), appUrl, clientDomain: serverEnv().clientDomain, key, now: () => new Date(), fetchLogo: logoFetcher(env.logoLimits) }, parsed.data),
  );
  if (!outcome.ran) return answer(409, "busy", "Another provisioning request is running. Try again.");
  const result = outcome.value;
  return result.ok ? Response.json({ ok: true, data: result.data }, { headers: NO_STORE }) : answer(result.status, result.code, result.message);
}

import { timingSafeEqual } from "node:crypto";
import { getStore } from "@/lib/db";
import { flushNotifications } from "@/lib/notifications/flush";
import { mailerFor } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";
import { getDirectory } from "@/lib/users/directory";
import { DirectoryError } from "@/lib/users/types";

const NO_STORE = { "Cache-Control": "no-store" };

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; compared in constant time. No secret set: nobody gets in. */
function authorized(header: string | null, secret: string | null): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const given = Buffer.from(header, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** GET /api/cron/notifications: every 5 minutes (vercel.json), sends the notification emails that are due (design §10). */
export async function GET(request: Request) {
  const env = servicesEnv();
  if (!authorized(request.headers.get("Authorization"), env.cronSecret)) {
    return Response.json({ ok: false, error: { status: 401, code: "unauthorized", message: "Missing or wrong CRON_SECRET." } }, { status: 401, headers: NO_STORE });
  }
  const store = getStore();
  const config = await store.webhook();
  try {
    const result = await flushNotifications({
      store,
      mailer: mailerFor(env),
      users: async () => (await (await getDirectory()).list()).users,
      origin: config ? new URL(config.url).origin : null,
      now: new Date(),
      quietMs: env.notifyQuietMs,
    });
    return Response.json({ ok: true, data: result }, { headers: NO_STORE });
  } catch (error) {
    if (!(error instanceof DirectoryError)) throw error;
    return Response.json({ ok: false, error: { status: 503, code: error.code, message: error.message } }, { status: 503, headers: NO_STORE });
  }
}

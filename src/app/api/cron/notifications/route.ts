import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { getAccountStore, getStore } from "@/lib/db";
import { flushNotifications, KEEP_DAYS } from "@/lib/notifications/flush";
import { mailerFor } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";
import { getDirectory } from "@/lib/users/directory";
import { DirectoryError } from "@/lib/users/types";

const NO_STORE = { "Cache-Control": "no-store" };

/** The cron job sends "Authorization: Bearer <CRON_SECRET>"; compared in constant time. No secret set: nobody gets in. */
function authorized(header: string | null, secret: string | null): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const given = Buffer.from(header, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** GET /api/cron/notifications: every 15 minutes (the host's cron job, README), sends the notification emails that are due (design §10). */
export async function GET(request: Request) {
  // Request time only: at build Next calls a GET to try to prerender it, and the settings must not be read then
  // (DB_MODE refuses the in-memory store in production; M5a).
  await connection();
  const env = servicesEnv();
  if (!authorized(request.headers.get("Authorization"), env.cronSecret)) {
    return Response.json({ ok: false, error: { status: 401, code: "unauthorized", message: "Missing or wrong CRON_SECRET." } }, { status: 401, headers: NO_STORE });
  }
  const store = getStore();
  const config = await store.webhook();
  try {
    // One run at a time (M5b): a mail server, unlike Resend, would deliver an email that two runs both sent.
    const outcome = await store.exclusive("articles_ai_flush", async () => {
      const result = await flushNotifications({
        store,
        mailer: mailerFor(env),
        users: async () => (await (await getDirectory()).list()).users,
        origin: config ? new URL(config.url).origin : null,
        now: new Date(),
        quietMs: env.notifyQuietMs,
      });
      // Spec M5c: the same run tidies the sign-in tables. Expired invitations stay listed (as Expired) for 30 days.
      const now = new Date();
      await getAccountStore().forgetExpired({
        now,
        invitationsBefore: new Date(now.getTime() - KEEP_DAYS * 86_400_000),
        limitsBefore: new Date(now.getTime() - 86_400_000),
      });
      return result;
    });
    return Response.json({ ok: true, data: outcome.ran ? outcome.value : { skipped: true } }, { headers: NO_STORE });
  } catch (error) {
    if (!(error instanceof DirectoryError)) throw error;
    return Response.json({ ok: false, error: { status: 503, code: error.code, message: error.message } }, { status: 503, headers: NO_STORE });
  }
}

import { connection } from "next/server";
import { serverEnv } from "@/lib/env";
import { createLogMailer } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";

/** Test logins with EMAIL_MODE=log only: the emails this server would have sent (e2e tests, local checks). 404 anywhere else. */
export async function GET() {
  await connection(); // read at request time: a GET that reads no request would be prerendered at build (Cache Components)
  if (serverEnv().authMode !== "mock" || servicesEnv().emailMode !== "log") return new Response(null, { status: 404 });
  return Response.json({ ok: true, data: createLogMailer().outbox() }, { headers: { "Cache-Control": "no-store" } });
}

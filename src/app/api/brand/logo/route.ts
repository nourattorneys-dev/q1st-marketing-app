import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAccountStore } from "@/lib/db";

/**
 * GET /api/brand/logo (P2): the signed-in person's client logo, kept by the app. The address carries ?v=<when it
 * changed>, so browsers keep it until it changes. A logo can be an SVG: served with a policy that runs no script.
 */
export async function GET() {
  await connection();
  const session = await getSession();
  const logo = session?.clientId ? await getAccountStore().clientLogo(session.clientId) : null;
  if (!logo) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

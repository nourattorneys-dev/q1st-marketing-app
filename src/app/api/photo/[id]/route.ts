import { connection } from "next/server";
import { can } from "@/lib/auth/roles";
import { getRole } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { ENGINE_ID } from "@/lib/engine/ids";
import { tryEngine } from "@/lib/engine/result";

/** GET /api/photo/[id]: a post's photo for the signed-in person's site; the engine's key stays on the server. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const role = await getRole();
  if (!role || !can(role, "content.work")) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await params;
  if (!ENGINE_ID.test(id)) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const engine = await getEngine();
  const result = await tryEngine(() => engine.photo(id));
  if (!result.ok || !result.data.contentType.startsWith("image/")) {
    return new Response(null, { status: result.ok ? 415 : result.error.status || 502, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(result.data.body, {
    headers: {
      "Content-Type": result.data.contentType,
      // The address carries the post's version, so a changed photo has a new address.
      "Cache-Control": "private, max-age=86400",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

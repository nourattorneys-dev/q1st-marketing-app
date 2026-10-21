import { can } from "@/lib/auth/roles";
import { getRole } from "@/lib/auth/session";
import { getEngine } from "@/lib/engine";
import { ENGINE_ID } from "@/lib/engine/ids";
import { tryEngine } from "@/lib/engine/result";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/jobs/[id]: the browser follows a slow AI job here (design §8); the engine's key stays on the server. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!role || !can(role, "content.work")) {
    return Response.json(
      { ok: false, error: { status: 401, code: "signed_out", message: "Your session has ended. Sign in again." } },
      { status: 401, headers: NO_STORE },
    );
  }
  const { id } = await params;
  if (!ENGINE_ID.test(id)) {
    return Response.json({ ok: false, error: { status: 404, code: "not_found", message: "No such job." } }, { status: 404, headers: NO_STORE });
  }
  const engine = await getEngine();
  const result = await tryEngine(() => engine.job(id));
  return Response.json(result, { status: result.ok ? 200 : result.error.status || 502, headers: NO_STORE });
}

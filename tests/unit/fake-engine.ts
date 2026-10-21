import { createEngineApi } from "@/lib/engine/api";
import { createEngineClient, type FetchLike } from "@/lib/engine/client";

export type FakeCall = { method: string; path: string; search: string; body: unknown };

/** A fake engine for API tests: answers by "METHOD /path" (site "site_1"), records what was sent, 404s anything else. */
export function fakeEngine(routes: Record<string, unknown>) {
  const calls: FakeCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    const { pathname, search } = new URL(url);
    const path = pathname.replace("/api/v1", "");
    const method = init.method ?? "GET";
    const body = init.body instanceof FormData ? init.body : typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, search, body });
    const key = `${method} ${path}`;
    if (key === "GET /sites") return Response.json({ ok: true, data: [{ id: "site_1" }] });
    if (!(key in routes)) return Response.json({ ok: false, error: { code: "not_found", message: key } }, { status: 404 });
    return Response.json({ ok: true, data: routes[key], meta: { page: 1, pageSize: 25, total: 3 } });
  };
  const engine = createEngineApi(createEngineClient({ baseUrl: "https://api.example.com/api/v1", apiKey: "k", fetch, retryDelaysMs: [0, 0] }));
  return { engine, calls };
}

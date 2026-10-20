import type { EngineClient } from "./client";
import { EngineError } from "./errors";
import { MetaSchema, PlanSchema, ScheduledSchema, SiteSchema, SitesSchema } from "./schemas";

/** Memoises an argument-less read for the life of one API instance (one request). */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= load());
}

export function createEngineApi(client: EngineClient) {
  const siteId = once(async () => {
    const { data } = await client.request({ method: "GET", path: "/sites", schema: SitesSchema });
    const first = data[0];
    if (!first) throw new EngineError({ status: 404, code: "not_found", message: "This API key has no site." });
    return first.id;
  });

  const sitePath = async () => `/sites/${encodeURIComponent(await siteId())}`;

  const meta = once(async () => (await client.request({ method: "GET", path: "/meta", schema: MetaSchema })).data);
  const site = once(async () => (await client.request({ method: "GET", path: await sitePath(), schema: SiteSchema })).data);
  const plan = once(async () => (await client.request({ method: "GET", path: "/account/plan", schema: PlanSchema })).data);

  async function scheduled(options: { pageSize?: number } = {}) {
    const { data } = await client.request({
      method: "GET",
      path: `${await sitePath()}/scheduled`,
      schema: ScheduledSchema,
      query: { pageSize: options.pageSize },
    });
    return data;
  }

  return { siteId, meta, site, plan, scheduled };
}

export type EngineApi = ReturnType<typeof createEngineApi>;

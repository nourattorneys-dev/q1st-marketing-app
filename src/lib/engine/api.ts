import { z } from "zod";
import type { EngineClient } from "./client";
import { EngineError } from "./errors";
import { MetaSchema, PlanSchema, ScheduledSchema, SiteRefsSchema, SiteSchema } from "./schemas";

/** Memoises an argument-less read for the life of one API instance (one request). */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= load());
}

export function createEngineApi(client: EngineClient) {
  const siteId = once(async () => {
    const { data } = await client.request({ method: "GET", path: "/sites", schema: SiteRefsSchema });
    const first = data[0];
    if (!first) throw new EngineError({ status: 404, code: "not_found", message: "This API key has no site." });
    return first.id;
  });

  const sitePath = async () => `/sites/${encodeURIComponent(await siteId())}`;

  /** One raw read of the site per request; each section validates only the fields it uses. */
  const siteRaw = once(async () => (await client.request({ method: "GET", path: await sitePath(), schema: z.unknown() })).data);

  async function sitePart<S extends z.ZodType>(schema: S): Promise<z.infer<S>> {
    const parsed = schema.safeParse(await siteRaw());
    if (!parsed.success) {
      throw new EngineError({
        status: 200,
        code: "invalid_response",
        message: "The content engine sent data in an unexpected format.",
        details: { issues: z.prettifyError(parsed.error) },
      });
    }
    return parsed.data;
  }

  const site = once(() => sitePart(SiteSchema));
  const siteCounts = once(() => sitePart(SiteSchema.pick({ counts: true })));
  const siteTimezone = once(() => sitePart(SiteSchema.pick({ timezone: true })));
  const siteConnections = once(() => sitePart(SiteSchema.pick({ connections: true })));

  const meta = once(async () => (await client.request({ method: "GET", path: "/meta", schema: MetaSchema })).data);
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

  return { siteId, meta, site, siteCounts, siteTimezone, siteConnections, plan, scheduled };
}

export type EngineApi = ReturnType<typeof createEngineApi>;

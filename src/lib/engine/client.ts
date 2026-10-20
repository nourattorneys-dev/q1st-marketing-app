import { z } from "zod";
import { EngineError } from "./errors";
import { EnvelopeSchema, type ListMeta } from "./schemas";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export type EngineClientConfig = {
  baseUrl: string;
  apiKey: string;
  fetch: FetchLike;
  /** Delays between read retries; reads are tried retryDelaysMs.length + 1 times. */
  retryDelaysMs?: readonly number[];
};

export type EngineRequest<S extends z.ZodType> = {
  method: HttpMethod;
  path: string; // starts with "/", relative to the base URL
  schema: S;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  actingUser?: string;
  idempotencyKey?: string;
};

export type EngineResponse<T> = { data: T; meta: ListMeta | null };

const DEFAULT_RETRY_DELAYS_MS = [250, 750] as const;

export function createEngineClient(config: EngineClientConfig) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const retryDelays = config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  async function request<S extends z.ZodType>(req: EngineRequest<S>): Promise<EngineResponse<z.infer<S>>> {
    const url = new URL(base + req.path);
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { "X-Api-Key": config.apiKey, Accept: "application/json" };
    if (req.actingUser) headers["X-Acting-User"] = req.actingUser;
    if (req.method !== "GET") headers["Idempotency-Key"] = req.idempotencyKey ?? crypto.randomUUID();

    let body: string | undefined;
    if (req.body !== undefined) {
      headers["Content-Type"] = "application/json; charset=utf-8";
      body = JSON.stringify(req.body);
    }

    // Only reads are retried; a change is never repeated automatically (design §9).
    const attempts = req.method === "GET" ? retryDelays.length + 1 : 1;
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await config.fetch(url.toString(), { method: req.method, headers, body, cache: "no-store" });
        return await parseResponse(response, req.schema);
      } catch (error) {
        if (error instanceof EngineError) throw error;
        if (attempt >= attempts - 1) {
          throw new EngineError({
            status: 0,
            code: "network_error",
            message: "The content engine could not be reached. Try again shortly.",
          });
        }
        await sleep(retryDelays[attempt] ?? 0);
      }
    }
  }

  return { request };
}

export type EngineClient = ReturnType<typeof createEngineClient>;

async function parseResponse<S extends z.ZodType>(response: Response, schema: S): Promise<EngineResponse<z.infer<S>>> {
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new EngineError({
      status: response.status,
      code: "engine_unavailable",
      message: `The content engine returned an unreadable response (HTTP ${response.status}).`,
    });
  }

  const envelope = EnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new EngineError({
      status: response.status,
      code: "invalid_response",
      message: "The content engine sent a response in an unexpected format.",
    });
  }

  if (!envelope.data.ok) {
    const { code, message, fields, details } = envelope.data.error;
    throw new EngineError({ status: response.status, code, message, fields, details });
  }

  const data = schema.safeParse(envelope.data.data);
  if (!data.success) {
    throw new EngineError({
      status: response.status,
      code: "invalid_response",
      message: "The content engine sent data in an unexpected format.",
      details: { issues: z.prettifyError(data.error) },
    });
  }

  return { data: data.data, meta: envelope.data.meta ?? null };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

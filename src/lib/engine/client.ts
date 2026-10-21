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
  /** Per-attempt limit (request + body). A timed-out attempt counts as a network failure. */
  timeoutMs?: number;
};

type Query = Record<string, string | number | boolean | undefined>;

export type EngineRequest<S extends z.ZodType> = {
  method: HttpMethod;
  path: string; // starts with "/", relative to the base URL
  schema: S;
  query?: Query;
  body?: unknown;
  /** A multipart body (photo upload); fetch sets the Content-Type with its boundary. */
  form?: FormData;
  actingUser?: string;
  idempotencyKey?: string;
};

export type EngineResponse<T> = { data: T; meta: ListMeta | null };

/** A downloaded file (spec v1.1 §7 export.html / .md): the body is the file itself, not the JSON envelope. */
export type EngineFile = { body: string; contentType: string; filename: string | null };

const DEFAULT_RETRY_DELAYS_MS = [250, 750] as const;
const DEFAULT_TIMEOUT_MS = 10_000;

export function createEngineClient(config: EngineClientConfig) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const retryDelays = config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  function urlOf(path: string, query: Query | undefined): URL {
    const url = new URL(base + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url;
  }

  /** Runs attempts with a timeout each; network failures are retried `attempts - 1` times, engine answers never. */
  async function withRetries<T>(attempts: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await withTimeout(timeoutMs, run);
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

  async function request<S extends z.ZodType>(req: EngineRequest<S>): Promise<EngineResponse<z.infer<S>>> {
    const url = urlOf(req.path, req.query);
    const headers: Record<string, string> = { "X-Api-Key": config.apiKey, Accept: "application/json" };
    if (req.actingUser) headers["X-Acting-User"] = req.actingUser;
    if (req.method !== "GET") headers["Idempotency-Key"] = req.idempotencyKey ?? crypto.randomUUID();

    let body: BodyInit | undefined;
    if (req.form) {
      body = req.form;
    } else if (req.body !== undefined) {
      headers["Content-Type"] = "application/json; charset=utf-8";
      body = JSON.stringify(req.body);
    }

    // Only reads are retried; a change is never repeated automatically (design §9).
    const attempts = req.method === "GET" ? retryDelays.length + 1 : 1;
    return withRetries(attempts, async (signal) => {
      const response = await config.fetch(url.toString(), { method: req.method, headers, body, cache: "no-store", signal });
      return parseResponse(response, req.schema);
    });
  }

  async function requestFile(req: { path: string; query?: Query }): Promise<EngineFile> {
    const url = urlOf(req.path, req.query);
    const headers = { "X-Api-Key": config.apiKey, Accept: "*/*" };
    return withRetries(retryDelays.length + 1, async (signal) => {
      const response = await config.fetch(url.toString(), { method: "GET", headers, cache: "no-store", signal });
      if (!response.ok) {
        await parseResponse(response, z.unknown()); // throws the engine's error from the JSON envelope
        throw new EngineError({ status: response.status, code: "invalid_response", message: "The content engine sent an unexpected answer." });
      }
      return {
        body: await response.text(),
        contentType: response.headers.get("Content-Type") ?? "application/octet-stream",
        filename: filenameOf(response.headers.get("Content-Disposition")),
      };
    });
  }

  return { request, requestFile };
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

/** The file name from Content-Disposition: filename*=UTF-8''… if present, else filename="…". */
function filenameOf(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // a malformed encoded name: fall back to the plain one
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : null;
}

/** Runs one attempt with an abort signal; rejects (and aborts) if it takes longer than `ms`. */
async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Engine request timed out after ${ms} ms`));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

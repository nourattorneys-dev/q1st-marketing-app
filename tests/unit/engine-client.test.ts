import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createEngineClient, type FetchLike } from "@/lib/engine/client";
import { EngineError } from "@/lib/engine/errors";
import { tryEngine } from "@/lib/engine/result";

type Call = { url: string; init: RequestInit };

function recorder(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("No more fake responses");
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetch };
}

const okJson = (data: unknown, meta?: unknown) => Response.json({ ok: true, data, ...(meta ? { meta } : {}) });
const errJson = (status: number, error: Record<string, unknown>) => Response.json({ ok: false, error }, { status });
const headersOf = (call: Call) => new Headers(call.init.headers);
const Thing = z.object({ id: z.string() });
const config = (fetch: FetchLike) => ({
  baseUrl: "https://api.example.com/api/v1/",
  apiKey: "secret-key",
  fetch,
  retryDelaysMs: [0, 0],
});

async function failure(promise: Promise<unknown>): Promise<EngineError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(EngineError);
  return error as EngineError;
}

describe("engine client", () => {
  it("GET: sends the key, encodes the query, returns data and list meta", async () => {
    const { calls, fetch } = recorder([okJson([{ id: "a" }], { page: 1, pageSize: 25, total: 1 })]);
    const client = createEngineClient(config(fetch));

    const res = await client.request({
      method: "GET",
      path: "/things",
      schema: z.array(Thing),
      query: { status: "pending,drafting", page: 1, q: undefined },
    });

    expect(res).toEqual({ data: [{ id: "a" }], meta: { page: 1, pageSize: 25, total: 1 } });
    expect(calls[0].url).toBe("https://api.example.com/api/v1/things?status=pending%2Cdrafting&page=1");
    expect(calls[0].init.method).toBe("GET");
    expect(headersOf(calls[0]).get("X-Api-Key")).toBe("secret-key");
    expect(headersOf(calls[0]).get("Idempotency-Key")).toBeNull();
    expect(headersOf(calls[0]).get("X-Acting-User")).toBeNull();
  });

  it("POST: sends the acting user, the idempotency key and a JSON body", async () => {
    const { calls, fetch } = recorder([okJson({ id: "p_1" })]);
    const client = createEngineClient(config(fetch));

    await client.request({
      method: "POST",
      path: "/posts/p_1/approve",
      schema: Thing,
      body: { overrideReason: "checked by hand" },
      actingUser: "sara@example.com",
      idempotencyKey: "key-123",
    });

    const headers = headersOf(calls[0]);
    expect(headers.get("Idempotency-Key")).toBe("key-123");
    expect(headers.get("X-Acting-User")).toBe("sara@example.com");
    expect(headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(calls[0].init.body).toBe(JSON.stringify({ overrideReason: "checked by hand" }));
  });

  it("generates an idempotency key for a change when none is given", async () => {
    const { calls, fetch } = recorder([okJson({ id: "p_1" })]);
    await createEngineClient(config(fetch)).request({ method: "DELETE", path: "/posts/p_1", schema: Thing });
    expect(headersOf(calls[0]).get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("turns an error envelope into an EngineError with its details", async () => {
    const { fetch } = recorder([
      errJson(429, {
        code: "quota_exceeded",
        message: "Monthly limit reached for articles",
        details: { metric: "articles", used: 40, limit: 40 },
      }),
    ]);
    const error = await failure(createEngineClient(config(fetch)).request({ method: "GET", path: "/x", schema: Thing }));
    expect(error).toMatchObject({
      status: 429,
      code: "quota_exceeded",
      message: "Monthly limit reached for articles",
      details: { metric: "articles", used: 40, limit: 40 },
    });
  });

  it("retries a read twice after network failures", async () => {
    const { calls, fetch } = recorder([new TypeError("fetch failed"), new TypeError("fetch failed"), okJson({ id: "a" })]);
    const res = await createEngineClient(config(fetch)).request({ method: "GET", path: "/x", schema: Thing });
    expect(res.data).toEqual({ id: "a" });
    expect(calls).toHaveLength(3);
  });

  it("gives up after three failed reads with network_error", async () => {
    const { calls, fetch } = recorder([new TypeError("a"), new TypeError("b"), new TypeError("c")]);
    const error = await failure(createEngineClient(config(fetch)).request({ method: "GET", path: "/x", schema: Thing }));
    expect(error).toMatchObject({ status: 0, code: "network_error" });
    expect(calls).toHaveLength(3);
  });

  it("never retries a change automatically", async () => {
    const { calls, fetch } = recorder([new TypeError("fetch failed")]);
    const error = await failure(
      createEngineClient(config(fetch)).request({ method: "POST", path: "/x", schema: Thing, idempotencyKey: "k" }),
    );
    expect(error.code).toBe("network_error");
    expect(calls).toHaveLength(1);
  });

  it("reports an HTML error page as engine_unavailable", async () => {
    const { fetch } = recorder([
      new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }),
    ]);
    const error = await failure(createEngineClient(config(fetch)).request({ method: "GET", path: "/x", schema: Thing }));
    expect(error).toMatchObject({ status: 502, code: "engine_unavailable" });
  });

  it("reports data in the wrong shape as invalid_response", async () => {
    const { fetch } = recorder([okJson({ id: 42 })]);
    const error = await failure(createEngineClient(config(fetch)).request({ method: "GET", path: "/x", schema: Thing }));
    expect(error.code).toBe("invalid_response");
  });

  it("reports a malformed envelope as invalid_response", async () => {
    const { fetch } = recorder([Response.json({ data: { id: "a" } })]);
    const error = await failure(createEngineClient(config(fetch)).request({ method: "GET", path: "/x", schema: Thing }));
    expect(error.code).toBe("invalid_response");
  });
});

describe("tryEngine", () => {
  it("wraps success", async () => {
    await expect(tryEngine(async () => 5)).resolves.toEqual({ ok: true, data: 5 });
  });

  it("turns an EngineError into a failure value", async () => {
    const result = await tryEngine(async () => {
      throw new EngineError({ status: 401, code: "unauthorized", message: "Key revoked" });
    });
    expect(result).toEqual({ ok: false, error: { status: 401, code: "unauthorized", message: "Key revoked" } });
  });

  it("rethrows anything that isn't an EngineError", async () => {
    await expect(
      tryEngine(async () => {
        throw new Error("bug");
      }),
    ).rejects.toThrow("bug");
  });
});

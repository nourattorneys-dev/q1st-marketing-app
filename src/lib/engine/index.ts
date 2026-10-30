import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { serverEnv } from "@/lib/env";
import { currentEngineKey } from "@/lib/tenancy";
import { createEngineApi } from "./api";
import { EngineError } from "./errors";
import { createEngineClient, type FetchLike } from "./client";
import { createMockFetch, isMockScenario, MOCK_SCENARIO_COOKIE } from "./mock/server";
import { MOCK_STORE_COOKIE, mockStoreFor } from "./mock/registry";

/** One engine API per request. Call only inside a component rendered under <Suspense>. */
export const getEngine = cache(async () => {
  const env = serverEnv();
  let fetchImpl: FetchLike;

  if (env.engineMode === "mock") {
    // The mock store reads the clock; a real engine call is network I/O. Opt out of prerendering the same way.
    await connection();
    const jar = await cookies();
    const scenario = jar.get(MOCK_SCENARIO_COOKIE)?.value;
    // The "crash" scenario throws a plain error, to show the error page (an engine error would show a notice instead).
    if (scenario === "crash") throw new Error("Simulated crash (mock scenario).");
    fetchImpl = createMockFetch({
      baseUrl: env.engineBaseUrl,
      apiKey: env.engineApiKey,
      scenario: isMockScenario(scenario) ? scenario : "normal",
      store: mockStoreFor(jar.get(MOCK_STORE_COOKIE)?.value, { firstRun: scenario === "firstrun" }),
    });
    return createEngineApi(createEngineClient({ baseUrl: env.engineBaseUrl, apiKey: env.engineApiKey, fetch: fetchImpl }));
  }
  // P1b: the current site's own key, decrypted here for this request only; it never reaches the browser or a log.
  const apiKey = await currentEngineKey();
  if (!apiKey) throw new EngineError({ status: 403, code: "no_site", message: "No website is set up for this account yet." });
  fetchImpl = (input, init) => fetch(input, init);
  return createEngineApi(createEngineClient({ baseUrl: env.engineBaseUrl, apiKey, fetch: fetchImpl }));
});

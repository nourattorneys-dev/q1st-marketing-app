import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { serverEnv } from "@/lib/env";
import { createEngineApi } from "./api";
import { createEngineClient, type FetchLike } from "./client";
import { createMockFetch, isMockScenario, MOCK_SCENARIO_COOKIE } from "./mock/server";
import { MOCK_STORE_COOKIE, mockStoreFor } from "./mock/registry";

/** One engine API per request. Call only inside a component rendered under <Suspense>. */
export const getEngine = cache(async () => {
  const env = serverEnv();
  let fetchImpl: FetchLike;

  if (env.engineMode === "mock") {
    const jar = await cookies();
    const scenario = jar.get(MOCK_SCENARIO_COOKIE)?.value;
    fetchImpl = createMockFetch({
      baseUrl: env.engineBaseUrl,
      apiKey: env.engineApiKey,
      scenario: isMockScenario(scenario) ? scenario : "normal",
      store: mockStoreFor(jar.get(MOCK_STORE_COOKIE)?.value),
    });
  } else {
    fetchImpl = (input, init) => fetch(input, init);
  }

  return createEngineApi(createEngineClient({ baseUrl: env.engineBaseUrl, apiKey: env.engineApiKey, fetch: fetchImpl }));
});

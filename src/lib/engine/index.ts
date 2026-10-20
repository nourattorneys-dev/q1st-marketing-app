import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { serverEnv } from "@/lib/env";
import { createEngineApi } from "./api";
import { createEngineClient, type FetchLike } from "./client";
import { createMockFetch, isMockScenario, MOCK_SCENARIO_COOKIE } from "./mock/server";

/** One engine API per request. Call only inside a component rendered under <Suspense>. */
export const getEngine = cache(async () => {
  const env = serverEnv();
  let fetchImpl: FetchLike;

  if (env.engineMode === "mock") {
    const scenario = (await cookies()).get(MOCK_SCENARIO_COOKIE)?.value;
    fetchImpl = createMockFetch({
      baseUrl: env.engineBaseUrl,
      apiKey: env.engineApiKey,
      scenario: isMockScenario(scenario) ? scenario : "normal",
    });
  } else {
    fetchImpl = (input, init) => fetch(input, init);
  }

  return createEngineApi(createEngineClient({ baseUrl: env.engineBaseUrl, apiKey: env.engineApiKey, fetch: fetchImpl }));
});

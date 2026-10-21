import "server-only";
import { drizzle } from "drizzle-orm/neon-http";
import { servicesEnv } from "@/lib/services-env";
import { createMemoryStore } from "./memory-store";
import { createNeonStore } from "./neon-store";
import * as schema from "./schema";
import type { AppStore } from "./store";

const MEMORY = Symbol.for("articles-ai.memory-store");
let neon: { url: string; store: AppStore } | null = null;

/** The dashboard's store: Neon Postgres (DB_MODE=neon), or one in-memory store per server process (local only). */
export function getStore(): AppStore {
  const env = servicesEnv();
  if (env.dbMode === "memory") {
    const holder = globalThis as unknown as Record<symbol, AppStore | undefined>;
    return (holder[MEMORY] ??= createMemoryStore());
  }
  const url = env.databaseUrl ?? "";
  if (neon?.url !== url) neon = { url, store: createNeonStore(drizzle(url, { schema })) };
  return neon.store;
}

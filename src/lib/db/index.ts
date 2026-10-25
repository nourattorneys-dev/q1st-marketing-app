import "server-only";
import { servicesEnv } from "@/lib/services-env";
import { createMemoryStore } from "./memory-store";
import { connectMysql } from "./mysql";
import { createMysqlStore } from "./mysql-store";
import type { AppStore } from "./store";

const MEMORY = Symbol.for("articles-ai.memory-store");
// Kept on globalThis, like the memory store: the server build loads this module in more than one runtime (route
// handlers and pages), and each copy would otherwise open its own pool: 6 connections instead of 3 (M5a final review).
const MYSQL = Symbol.for("articles-ai.mysql-store");

/** The dashboard's store: the client's MySQL (DB_MODE=mysql), or one in-memory store per server process (local and tests). */
export function getStore(): AppStore {
  const env = servicesEnv();
  if (env.dbMode === "memory") {
    const holder = globalThis as unknown as Record<symbol, AppStore | undefined>;
    return (holder[MEMORY] ??= createMemoryStore());
  }
  const url = env.databaseUrl ?? "";
  const holder = globalThis as unknown as Record<symbol, { url: string; store: AppStore } | undefined>;
  let current = holder[MYSQL];
  if (current?.url !== url) holder[MYSQL] = current = { url, store: createMysqlStore(connectMysql(url)) };
  return current.store;
}

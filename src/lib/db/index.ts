import "server-only";
import { servicesEnv } from "@/lib/services-env";
import { createMemoryStore } from "./memory-store";
import { connectMysql } from "./mysql";
import { createMysqlStore } from "./mysql-store";
import type { AppStore } from "./store";

const MEMORY = Symbol.for("articles-ai.memory-store");
let mysql: { url: string; store: AppStore } | null = null;

/** The dashboard's store: the client's MySQL (DB_MODE=mysql), or one in-memory store per server process (local and tests). */
export function getStore(): AppStore {
  const env = servicesEnv();
  if (env.dbMode === "memory") {
    const holder = globalThis as unknown as Record<symbol, AppStore | undefined>;
    return (holder[MEMORY] ??= createMemoryStore());
  }
  const url = env.databaseUrl ?? "";
  if (mysql?.url !== url) mysql = { url, store: createMysqlStore(connectMysql(url)) };
  return mysql.store;
}

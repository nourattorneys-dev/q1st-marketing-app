import "server-only";
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { createMysqlAccountStore } from "@/lib/accounts/mysql-store";
import type { AccountStore } from "@/lib/accounts/store";
import { servicesEnv } from "@/lib/services-env";
import { createMemoryStore } from "./memory-store";
import { connectMysql } from "./mysql";
import { createMysqlStore } from "./mysql-store";
import type { AppStore } from "./store";

const MEMORY = Symbol.for("articles-ai.memory-store");
const MEMORY_ACCOUNTS = Symbol.for("articles-ai.memory-accounts");
// Kept on globalThis, like the memory store: the server build loads this module in more than one runtime (route
// handlers and pages), and each copy would otherwise open its own pool: 6 connections instead of 3 (M5a final review).
// The account store shares the same pool (spec M5c).
const MYSQL = Symbol.for("articles-ai.mysql-store");

type MysqlStores = { url: string; store: AppStore; accounts: AccountStore };

function mysqlStores(url: string): MysqlStores {
  const holder = globalThis as unknown as Record<symbol, MysqlStores | undefined>;
  let current = holder[MYSQL];
  if (current?.url !== url) {
    const connection = connectMysql(url);
    holder[MYSQL] = current = { url, store: createMysqlStore(connection), accounts: createMysqlAccountStore(connection) };
  }
  return current;
}

/** The dashboard's store: the client's MySQL (DB_MODE=mysql), or one in-memory store per server process (local and tests). */
export function getStore(): AppStore {
  const env = servicesEnv();
  if (env.dbMode === "memory") {
    const holder = globalThis as unknown as Record<symbol, AppStore | undefined>;
    return (holder[MEMORY] ??= createMemoryStore());
  }
  return mysqlStores(env.databaseUrl ?? "").store;
}

/** The accounts (spec M5c), beside getStore() and on the same MySQL pool. */
export function getAccountStore(): AccountStore {
  const env = servicesEnv();
  if (env.dbMode === "memory") {
    const holder = globalThis as unknown as Record<symbol, AccountStore | undefined>;
    return (holder[MEMORY_ACCOUNTS] ??= createMemoryAccountStore());
  }
  return mysqlStores(env.databaseUrl ?? "").accounts;
}

import "server-only";
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { createPostgresAccountStore } from "@/lib/accounts/postgres-store";
import type { AccountStore } from "@/lib/accounts/store";
import { servicesEnv } from "@/lib/services-env";
import { createMemoryStore } from "./memory-store";
import { connectPostgres } from "./postgres";
import { createPostgresStore } from "./postgres-store";
import type { AppStore } from "./store";

const MEMORY = Symbol.for("articles-ai.memory-store");
const MEMORY_ACCOUNTS = Symbol.for("articles-ai.memory-accounts");
// Kept on globalThis, like the memory store: the server build loads this module in more than one runtime (route
// handlers and pages), and each copy would otherwise open its own pool. The account store shares the same pool.
const POSTGRES = Symbol.for("articles-ai.postgres-store");

type PostgresStores = { url: string; store: AppStore; accounts: AccountStore };

function postgresStores(url: string, poolSize: number): PostgresStores {
  const holder = globalThis as unknown as Record<symbol, PostgresStores | undefined>;
  let current = holder[POSTGRES];
  if (current?.url !== url) {
    const connection = connectPostgres(url, { poolSize });
    holder[POSTGRES] = current = { url, store: createPostgresStore(connection), accounts: createPostgresAccountStore(connection) };
  }
  return current;
}

/** The dashboard's store: its own Postgres (DB_MODE=postgres), or one in-memory store per server process (local and tests). */
export function getStore(): AppStore {
  const env = servicesEnv();
  if (env.dbMode === "memory") {
    const holder = globalThis as unknown as Record<symbol, AppStore | undefined>;
    return (holder[MEMORY] ??= createMemoryStore());
  }
  return postgresStores(env.databaseUrl ?? "", env.dbPoolMax).store;
}

/** The accounts (spec M5c), beside getStore() and on the same Postgres pool. */
export function getAccountStore(): AccountStore {
  const env = servicesEnv();
  if (env.dbMode === "memory") {
    const holder = globalThis as unknown as Record<symbol, AccountStore | undefined>;
    return (holder[MEMORY_ACCOUNTS] ??= createMemoryAccountStore());
  }
  return postgresStores(env.databaseUrl ?? "", env.dbPoolMax).accounts;
}

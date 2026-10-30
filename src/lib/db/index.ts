import "server-only";
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { createPostgresAccountStore } from "@/lib/accounts/postgres-store";
import type { AccountStore } from "@/lib/accounts/store";
import { servicesEnv } from "@/lib/services-env";
import { createMemoryState, createMemoryStore, type MemoryState } from "./memory-store";
import { connectPostgres, type PostgresConnection } from "./postgres";
import { createPostgresStore } from "./postgres-store";
import type { AppStore } from "./store";

const MEMORY = Symbol.for("articles-ai.memory-store");
const MEMORY_ACCOUNTS = Symbol.for("articles-ai.memory-accounts");
// Kept on globalThis, like the memory store: the server build loads this module in more than one runtime (route
// handlers and pages), and each copy would otherwise open its own pool. The account store shares the same pool.
const POSTGRES = Symbol.for("articles-ai.postgres-store");

type PostgresStores = { url: string; connection: PostgresConnection; sites: Map<string, AppStore>; accounts: AccountStore };

function postgresStores(url: string, poolSize: number): PostgresStores {
  const holder = globalThis as unknown as Record<symbol, PostgresStores | undefined>;
  let current = holder[POSTGRES];
  if (current?.url !== url) {
    const connection = connectPostgres(url, { poolSize });
    holder[POSTGRES] = current = { url, connection, sites: new Map(), accounts: createPostgresAccountStore(connection) };
  }
  return current;
}

/** One site's records (P1b): its own Postgres (DB_MODE=postgres), or this server process's memory (local and tests). */
export function getStore(siteId: string): AppStore {
  const env = servicesEnv();
  if (env.dbMode === "memory") {
    const holder = globalThis as unknown as Record<symbol, { state: MemoryState; sites: Map<string, AppStore> } | undefined>;
    const memory = (holder[MEMORY] ??= { state: createMemoryState(), sites: new Map() });
    let store = memory.sites.get(siteId);
    if (!store) memory.sites.set(siteId, (store = createMemoryStore(siteId, memory.state)));
    return store;
  }
  const stores = postgresStores(env.databaseUrl ?? "", env.dbPoolMax);
  let store = stores.sites.get(siteId);
  if (!store) stores.sites.set(siteId, (store = createPostgresStore(stores.connection, siteId)));
  return store;
}

/** One run at a time across the app (advisory locks; not tied to a site): first Admin, first client, the cron run. */
export function getExclusive(): AppStore["exclusive"] {
  return getAppStore().exclusive;
}

/** The parts that are per person, not per site (notification choices, locks). */
export function getAppStore(): Pick<AppStore, "emailOffUsers" | "setEmailOff" | "exclusive"> {
  return getStore("_app");
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

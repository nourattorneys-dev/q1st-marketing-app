import { createMockStore, type MockStore } from "./store";

export const MOCK_STORE_COOKIE = "mock_store";
const REGISTRY = Symbol.for("articles-ai.mock-stores");

/**
 * One stateful mock per namespace (e2e tests use a fresh namespace each). Survives dev hot reloads via globalThis.
 * `firstRun` matters only when the namespace's store is created (the "firstrun" scenario: no connections set up yet).
 */
export function mockStoreFor(namespace?: string, options: { firstRun?: boolean } = {}): MockStore {
  const holder = globalThis as unknown as Record<symbol, Map<string, MockStore> | undefined>;
  const stores = (holder[REGISTRY] ??= new Map<string, MockStore>());
  const key = namespace && /^[A-Za-z0-9_-]{1,64}$/.test(namespace) ? namespace : "default";
  let store = stores.get(key);
  if (!store) {
    store = createMockStore({ firstRun: options.firstRun });
    stores.set(key, store);
  }
  return store;
}

import type { AccountStore } from "@/lib/accounts/store";
import { newId } from "@/lib/accounts/tokens";
import type { AppStore } from "@/lib/db/store";
import { encryptSiteKey } from "./site-key";

export type EngineSite = { id: string; name: string };

/**
 * P1b settings-file migration: with no client yet and an engine key in the settings, the first client and its site are
 * made from it (the engine says which site the key opens). Everyone already here joins that client, and the records
 * kept before sites existed become that site's. Runs once, under a lock; a second caller finds the client made.
 */
export async function ensureFirstClient(deps: {
  accounts: AccountStore;
  storeFor: (siteId: string) => AppStore;
  exclusive: AppStore["exclusive"];
  engineApiKey: string | null;
  lookUpSite: (engineKey: string) => Promise<EngineSite>;
  key: Buffer | null;
  now: Date;
}): Promise<"ready" | "made" | "no-key" | "busy"> {
  const { accounts, engineApiKey } = deps;
  if ((await accounts.clients()).length > 0) return "ready";
  if (!engineApiKey) return "no-key";
  if (!deps.key) throw new Error("Set APP_ENCRYPTION_KEY (32 bytes, base64) so each site's engine key can be kept encrypted.");
  const key = deps.key;
  const outcome = await deps.exclusive("articles_ai_first_client", async () => {
    if ((await accounts.clients()).length > 0) return "ready" as const;
    const site = await deps.lookUpSite(engineApiKey);
    const clientId = newId("cli");
    await accounts.createClient({ id: clientId, name: site.name, createdAt: deps.now });
    await accounts.createSite({ id: site.id, clientId, name: site.name, keyCipher: encryptSiteKey(engineApiKey, key), createdAt: deps.now });
    await accounts.adoptUnassigned(clientId);
    await deps.storeFor(site.id).adoptUnassigned();
    console.info(`First client made from the settings file: site ${site.id}`);
    return "made" as const;
  });
  return outcome.ran ? outcome.value : "busy";
}

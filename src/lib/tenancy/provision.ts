import { z } from "zod";
import { createAccountsDirectory } from "@/lib/accounts/accounts-directory";
import type { AccountStore } from "@/lib/accounts/store";
import { newId } from "@/lib/accounts/tokens";
import type { AppStore } from "@/lib/db/store";
import type { Mailer } from "@/lib/notifications/mailer";
import { DirectoryError } from "@/lib/users/types";
import { encryptSecret } from "@/lib/webhooks/secret";
import { hookUrlFor } from "@/lib/webhooks/status";
import { encryptSiteKey } from "./site-key";

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,191}$/);
const Name = z.string().trim().min(1).max(200);
const Secret = z.string().min(16).max(500);

/**
 * P1c: what the staff portal (through the engine) asks of the app. A client is one engine account; a site is one engine
 * site. `site.upsert` makes or updates both; a new site must bring its engine key and webhook secret.
 */
export const ProvisionRequest = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("site.upsert"),
    accountId: Id,
    accountName: Name,
    siteId: Id,
    siteName: Name,
    engineKey: Secret.optional(),
    webhookSecret: Secret.optional(),
    admin: z.object({ email: z.string().trim().min(3).max(254) }).optional(),
  }),
  z.object({ action: z.literal("site.remove"), accountId: Id, siteId: Id }),
  z.object({ action: z.literal("client.rename"), accountId: Id, accountName: Name }),
]);
export type ProvisionRequest = z.infer<typeof ProvisionRequest>;

/** `member`: already has an account in this client; `invited`: a new invitation; `reinvited`: a pending one sent again. */
export type AdminInvite = "member" | "invited" | "reinvited";
export type ProvisionResult =
  | { ok: true; data: { clientId: string; siteId?: string; hookUrl?: string; admin?: AdminInvite; removed?: boolean } }
  | { ok: false; status: number; code: string; message: string };

const fail = (status: number, code: string, message: string): ProvisionResult => ({ ok: false, status, code, message });

export async function provision(
  deps: {
    accounts: AccountStore;
    storeFor: (siteId: string) => AppStore;
    mailer: Mailer;
    appUrl: string;
    key: Buffer;
    now: () => Date;
  },
  request: ProvisionRequest,
): Promise<ProvisionResult> {
  const { accounts } = deps;
  if (request.action === "client.rename") {
    const client = await accounts.clientByEngineAccount(request.accountId);
    if (!client) return fail(404, "not_found", "No client in the app for this account.");
    await accounts.updateClient(client.id, { name: request.accountName });
    return { ok: true, data: { clientId: client.id } };
  }

  const site = await accounts.site(request.siteId);
  let client = await accounts.clientByEngineAccount(request.accountId);
  if (!client && site) {
    // A client made before the portal linked it (from the settings file): its site says which it is.
    const owner = await accounts.client(site.clientId);
    if (owner && !owner.engineAccountId) {
      await accounts.updateClient(owner.id, { engineAccountId: request.accountId });
      client = { ...owner, engineAccountId: request.accountId };
    }
  }
  if (site && (!client || site.clientId !== client.id)) return fail(409, "conflict", "This site belongs to another client in the app.");

  if (request.action === "site.remove") {
    if (!site || !client) return fail(404, "not_found", "No such site in the app.");
    await accounts.deleteSite(site.id);
    console.info(`Site removed from the app: ${site.id}`);
    return { ok: true, data: { clientId: client.id, siteId: site.id, removed: true } };
  }

  if (!site && (!request.engineKey || !request.webhookSecret)) {
    return fail(400, "invalid_input", "A new site needs its engine key and webhook secret.");
  }
  const at = deps.now();
  if (!client) {
    client = { id: newId("cli"), name: request.accountName, engineAccountId: request.accountId, createdAt: at };
    await accounts.createClient(client);
  } else if (client.name !== request.accountName) {
    await accounts.updateClient(client.id, { name: request.accountName });
  }
  const keyCipher = request.engineKey ? encryptSiteKey(request.engineKey, deps.key) : undefined;
  if (site) await accounts.updateSite(site.id, { name: request.siteName, ...(keyCipher ? { keyCipher } : {}) });
  else await accounts.createSite({ id: request.siteId, clientId: client.id, name: request.siteName, keyCipher: keyCipher!, createdAt: at });

  const hookUrl = hookUrlFor(deps.appUrl);
  if (request.webhookSecret) {
    await deps.storeFor(request.siteId).saveWebhook({ url: hookUrl, secretCipher: encryptSecret(request.webhookSecret, deps.key), updatedAt: at });
  }

  let admin: AdminInvite | undefined;
  if (request.admin) {
    const outcome = await inviteAdmin(deps, client.id, request.admin.email);
    if (typeof outcome !== "string") return outcome;
    admin = outcome;
  }
  console.info(`Site ${site ? "updated" : "added"} in the app: ${request.siteId} (client ${client.id})`);
  return { ok: true, data: { clientId: client.id, siteId: request.siteId, hookUrl, ...(admin ? { admin } : {}) } };
}

/** The client's first Admin: invited by email, or the pending invitation sent again (a new link). */
async function inviteAdmin(
  deps: Parameters<typeof provision>[0],
  clientId: string,
  email: string,
): Promise<AdminInvite | ProvisionResult> {
  const { accounts } = deps;
  const tidy = email.trim().toLowerCase();
  const account = await accounts.accountByEmail(tidy);
  if (account) {
    return account.clientId === clientId ? "member" : fail(409, "conflict", "This email already has an account with another client.");
  }
  const pending = await accounts.invitationByEmail(tidy);
  if (pending && pending.clientId !== clientId) return fail(409, "conflict", "This email already has an invitation from another client.");
  const directory = createAccountsDirectory({ store: accounts, mailer: deps.mailer, appUrl: deps.appUrl, clientId, sites: [], now: deps.now });
  try {
    if (pending) {
      await directory.resendInvite(pending.id);
      return "reinvited";
    }
    await directory.invite(tidy, "admin", null, null);
    return "invited";
  } catch (error) {
    if (error instanceof DirectoryError) {
      return fail(error.code === "mail_failed" ? 502 : 400, error.code === "mail_failed" ? "mail_failed" : "invalid_input", error.message);
    }
    throw error;
  }
}

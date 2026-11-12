import "server-only";
import { getSession } from "@/lib/auth/session";
import { getAccountStore } from "@/lib/db";
import { getHostClient } from "@/lib/tenancy";

/** The client a page belongs to, for the browser tab: the client of this address, else the signed-in person's client. */
export async function tabClientName(): Promise<string | null> {
  const host = await getHostClient();
  if (host) return host.name;
  const session = await getSession();
  if (!session?.clientId) return null;
  return (await getAccountStore().client(session.clientId))?.name ?? null;
}

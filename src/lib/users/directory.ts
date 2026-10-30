import "server-only";
import { cookies } from "next/headers";
import { createAccountsDirectory } from "@/lib/accounts/accounts-directory";
import { getAccountStore } from "@/lib/db";
import { MOCK_STORE_COOKIE } from "@/lib/engine/mock/registry";
import { MOCK_SCENARIO_COOKIE } from "@/lib/engine/mock/server";
import { serverEnv } from "@/lib/env";
import { mailerFor } from "@/lib/notifications/mailer";
import { servicesEnv } from "@/lib/services-env";
import { getCurrentSite } from "@/lib/tenancy";
import { createMockDirectory } from "./mock-directory";
import { DirectoryError, type UserDirectory } from "./types";

/** Test logins only: the mock scenario in which the sign-in service can't be reached (Review Focus 4). The engine stays normal. */
const SIGNIN_DOWN = "signin_down";

/** The users behind this dashboard: its own accounts (AUTH_MODE=password), or the test directory (per mock_store namespace). */
export async function getDirectory(): Promise<UserDirectory> {
  const env = serverEnv();
  if (env.authMode === "mock") {
    const jar = await cookies();
    if (jar.get(MOCK_SCENARIO_COOKIE)?.value === SIGNIN_DOWN) return unreachableDirectory();
    return createMockDirectory(jar.get(MOCK_STORE_COOKIE)?.value);
  }
  // P1b: the signed-in person's client; with no client to show, the page says the directory can't be reached.
  const current = await getCurrentSite();
  if (!current) return unreachableDirectory();
  return createAccountsDirectory({
    store: getAccountStore(),
    mailer: mailerFor(servicesEnv()),
    appUrl: env.appUrl ?? "",
    clientId: current.client.id,
    sites: current.sites,
  });
}

function unreachableDirectory(): UserDirectory {
  const fail = async (): Promise<never> => {
    throw new DirectoryError("unavailable", "The sign-in service can't be reached right now. Try again shortly.");
  };
  return { list: fail, invite: fail, resendInvite: fail, revokeInvite: fail, setRole: fail, setSites: fail };
}

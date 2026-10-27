import "server-only";
import { cookies } from "next/headers";
import { MOCK_STORE_COOKIE } from "@/lib/engine/mock/registry";
import { MOCK_SCENARIO_COOKIE } from "@/lib/engine/mock/server";
import { serverEnv } from "@/lib/env";
import { createClerkDirectory } from "./clerk-directory";
import { createMockDirectory } from "./mock-directory";
import { DirectoryError, type UserDirectory } from "./types";

/** Test logins only: the mock scenario in which the sign-in service can't be reached (Review Focus 4). The engine stays normal. */
const SIGNIN_DOWN = "signin_down";

/** The users behind this dashboard: Clerk's in Clerk mode, the test directory (per mock_store namespace) otherwise. */
export async function getDirectory(): Promise<UserDirectory> {
  if (serverEnv().authMode === "mock") {
    const jar = await cookies();
    if (jar.get(MOCK_SCENARIO_COOKIE)?.value === SIGNIN_DOWN) return unreachableDirectory();
    return createMockDirectory(jar.get(MOCK_STORE_COOKIE)?.value);
  }
  const { clerkClient } = await import("@clerk/nextjs/server");
  return createClerkDirectory(await clerkClient());
}

function unreachableDirectory(): UserDirectory {
  const fail = async (): Promise<never> => {
    throw new DirectoryError("unavailable", "The sign-in service can't be reached right now. Try again shortly.");
  };
  return { list: fail, invite: fail, resendInvite: fail, revokeInvite: fail, setRole: fail };
}

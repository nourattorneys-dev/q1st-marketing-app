import { expect, type Page } from "@playwright/test";
import { createPostgresAccountStore } from "../../src/lib/accounts/postgres-store";
import { hashPassword } from "../../src/lib/accounts/passwords";
import type { Account, AccountStore } from "../../src/lib/accounts/store";
import { newId } from "../../src/lib/accounts/tokens";
import type { Role } from "../../src/lib/auth/roles";
import { connectPostgres } from "../../src/lib/db/postgres";
import { testDatabaseUrl } from "../unit/postgres-test-db";
import { E2E_PASSWORD_DB } from "./constants";

export const PASSWORD = "correct horse battery";
const ACCOUNT_TABLES = ["users", "sessions", "invitations", "password_resets", "sign_in_limits"];

/** Runs `run` on the suite's accounts, in the database the server uses. */
export async function withAccounts<T>(run: (store: AccountStore) => Promise<T>): Promise<T> {
  const connection = connectPostgres(testDatabaseUrl(E2E_PASSWORD_DB));
  try {
    return await run(createPostgresAccountStore(connection));
  } finally {
    await connection.close();
  }
}

/** No accounts, invitations, sessions or limits: every test starts from the same place. */
export async function resetAccounts(): Promise<void> {
  const connection = connectPostgres(testDatabaseUrl(E2E_PASSWORD_DB));
  try {
    for (const table of ACCOUNT_TABLES) await connection.pool.query(`DELETE FROM "${table}"`);
  } finally {
    await connection.close();
  }
}

export async function seedAccount(input: { email: string; role: Role | null; name?: string; password?: string }): Promise<Account> {
  const now = new Date();
  const account: Account = {
    id: newId("usr"),
    email: input.email,
    name: input.name ?? input.email,
    role: input.role,
    passwordHash: await hashPassword(input.password ?? PASSWORD),
    createdAt: now,
    passwordChangedAt: now,
    lastSignInAt: null,
  };
  await withAccounts(async (store) => {
    expect(await store.createAccount(account)).toBe(true);
  });
  return account;
}

export async function signInWithPassword(page: Page, email: string, password = PASSWORD, locale = "en"): Promise<void> {
  await page.goto(`/${locale}/sign-in`);
  await page.getByTestId("sign-in-email").fill(email);
  await page.getByTestId("sign-in-password").fill(password);
  await page.getByTestId("sign-in-submit").click();
}

/** The path of an emailed link (its English half), ready for page.goto. */
export function linkIn(text: string, path: "invitation" | "reset-password"): string {
  const match = new RegExp(`https?://[^/\\s]+(/en/${path}\\?token=[A-Za-z0-9_%-]+)`).exec(text);
  expect(match, `no /en/${path} link in the email`).not.toBeNull();
  return match?.[1] ?? "";
}

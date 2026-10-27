import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { createMysqlAccountStore } from "@/lib/accounts/mysql-store";
import type { Account, AccountStore, Invitation } from "@/lib/accounts/store";
import { connectMysql, type MysqlConnection } from "@/lib/db/mysql";
import { freshTestDatabase } from "./mysql-test-db";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 27, 8, minute, 0, 123));
let sequence = 0;
const account = (email: string, changes: Partial<Account> = {}): Account => ({
  id: `usr_test${++sequence}`,
  email,
  name: "Sara Ali",
  role: "reviewer",
  passwordHash: "scrypt$15$8$1$salt$hash",
  createdAt: at(sequence),
  passwordChangedAt: at(sequence),
  lastSignInAt: null,
  ...changes,
});
const invitation = (email: string, changes: Partial<Invitation> = {}): Invitation => ({
  id: `inv_test${++sequence}`,
  email,
  role: "reviewer",
  tokenHash: `${sequence}`.padStart(64, "a"),
  invitedBy: null,
  createdAt: at(sequence),
  expiresAt: at(sequence + 60),
  ...changes,
});

const TABLES = ["users", "sessions", "invitations", "password_resets", "sign_in_limits"];
let mysql: MysqlConnection;

beforeAll(async () => {
  mysql = connectMysql(await freshTestDatabase("account_store"));
  await mysql.ready();
});

afterAll(async () => {
  await mysql?.close();
});

async function emptyMysqlStore(): Promise<AccountStore> {
  for (const table of TABLES) await mysql.pool.query(`DELETE FROM \`${table}\``);
  return createMysqlAccountStore(mysql);
}

describe.each([
  { name: "the in-memory account store", createStore: async (): Promise<AccountStore> => createMemoryAccountStore() },
  { name: "the MySQL account store", createStore: emptyMysqlStore },
])("$name (spec M5c)", ({ createStore }) => {
  it("keeps one account per email, finds it by id and email, and lists them oldest first", async () => {
    const store = await createStore();
    const omar = account("omar@example.com");
    const sara = account("sara@example.com", { name: "سارة علي 👋", role: "admin" });
    expect(await store.createAccount(omar)).toBe(true);
    expect(await store.createAccount(sara)).toBe(true);
    expect(await store.createAccount(account("sara@example.com"))).toBe(false);
    expect(await store.account(sara.id)).toEqual(sara);
    expect(await store.accountByEmail("sara@example.com")).toEqual(sara);
    expect(await store.accountByEmail("nobody@example.com")).toBeNull();
    expect((await store.accounts()).map((a) => a.email)).toEqual(["omar@example.com", "sara@example.com"]);
    expect(await store.hasAdmin()).toBe(true);
  });

  it("changes a role, a password and the last sign-in", async () => {
    const store = await createStore();
    const omar = account("omar@example.com");
    await store.createAccount(omar);
    expect(await store.hasAdmin()).toBe(false);
    expect(await store.setRole(omar.id, "admin")).toMatchObject({ id: omar.id, role: "admin" });
    expect(await store.setRole("usr_missing", "admin")).toBeNull();
    await store.setPassword(omar.id, "scrypt$15$8$1$new$hash", at(30));
    await store.recordSignIn(omar.id, at(31));
    expect(await store.account(omar.id)).toMatchObject({ passwordHash: "scrypt$15$8$1$new$hash", passwordChangedAt: at(30), lastSignInAt: at(31), role: "admin" });
  });

  it("finds an account through a live session only, and ends one or all of someone's sessions", async () => {
    const store = await createStore();
    const omar = account("omar@example.com");
    await store.createAccount(omar);
    for (const hash of ["a", "b", "c"]) await store.createSession({ tokenHash: hash.repeat(64), userId: omar.id, createdAt: at(0), expiresAt: at(30) });
    expect(await store.sessionAccount("a".repeat(64), at(10))).toEqual(omar);
    expect(await store.sessionAccount("a".repeat(64), at(30))).toBeNull();
    expect(await store.sessionAccount("z".repeat(64), at(10))).toBeNull();
    await store.deleteSession("a".repeat(64));
    expect(await store.sessionAccount("a".repeat(64), at(10))).toBeNull();
    await store.deleteSessionsOf(omar.id, "b".repeat(64));
    expect(await store.sessionAccount("b".repeat(64), at(10))).toEqual(omar);
    expect(await store.sessionAccount("c".repeat(64), at(10))).toBeNull();
    await store.deleteSessionsOf(omar.id);
    expect(await store.sessionAccount("b".repeat(64), at(10))).toBeNull();
  });

  it("keeps one invitation per email, finds it by id, email and token, renews and deletes it", async () => {
    const store = await createStore();
    const first = invitation("new@example.com");
    expect(await store.addInvitation(first)).toBe(true);
    expect(await store.addInvitation(invitation("new@example.com"))).toBe(false);
    expect(await store.invitation(first.id)).toEqual(first);
    expect(await store.invitationByEmail("new@example.com")).toEqual(first);
    expect(await store.invitationByToken(first.tokenHash)).toEqual(first);
    const renewal = { tokenHash: "f".repeat(64), createdAt: at(40), expiresAt: at(100) };
    expect(await store.renewInvitation(first.id, renewal)).toBe(true);
    expect(await store.invitationByToken(first.tokenHash)).toBeNull();
    expect(await store.invitationByToken("f".repeat(64))).toEqual({ ...first, ...renewal });
    expect(await store.renewInvitation("inv_missing", renewal)).toBe(false);
    expect((await store.invitations()).map((i) => i.id)).toEqual([first.id]);
    expect(await store.deleteInvitation(first.id)).toBe(true);
    expect(await store.deleteInvitation(first.id)).toBe(false);
  });

  it("accepting creates the account once and removes the invitation; never for an email that already has an account (Review Focus 3)", async () => {
    const store = await createStore();
    const invite = invitation("new@example.com");
    await store.addInvitation(invite);
    const created = account("new@example.com");
    expect(await store.acceptInvitation(invite.id, created)).toBe(true);
    expect(await store.accountByEmail("new@example.com")).toEqual(created);
    expect(await store.invitation(invite.id)).toBeNull();
    expect(await store.acceptInvitation(invite.id, account("new@example.com"))).toBe(false);

    const second = invitation("taken@example.com");
    await store.addInvitation(second);
    await store.createAccount(account("taken@example.com"));
    expect(await store.acceptInvitation(second.id, account("taken@example.com"))).toBe(false);
    expect(await store.invitation(second.id)).toEqual(second);
    expect((await store.accounts()).filter((a) => a.email === "taken@example.com")).toHaveLength(1);
  });

  it("keeps password resets by token and deletes all of someone's", async () => {
    const store = await createStore();
    const reset = { tokenHash: "d".repeat(64), userId: "usr_x", createdAt: at(0), expiresAt: at(60) };
    await store.createReset(reset);
    await store.createReset({ ...reset, tokenHash: "e".repeat(64) });
    expect(await store.resetByToken("d".repeat(64))).toEqual(reset);
    await store.deleteResetsOf("usr_x");
    expect(await store.resetByToken("d".repeat(64))).toBeNull();
    expect(await store.resetByToken("e".repeat(64))).toBeNull();
  });

  it("counts hits within a window, starts a new window once it has passed, and clears", async () => {
    const store = await createStore();
    const window = 15 * 60_000;
    expect(await store.hits("email:a@example.com", at(0), window)).toBe(0);
    expect(await store.hit("email:a@example.com", at(0), window)).toBe(1);
    expect(await store.hit("email:a@example.com", at(5), window)).toBe(2);
    expect(await store.hit("email:a@example.com", at(14), window)).toBe(3);
    expect(await store.hits("email:a@example.com", at(14), window)).toBe(3);
    expect(await store.hits("email:a@example.com", at(15), window)).toBe(0);
    expect(await store.hit("email:a@example.com", at(15), window)).toBe(1);
    await store.clearHits("email:a@example.com");
    expect(await store.hits("email:a@example.com", at(15), window)).toBe(0);
  });

  it("forgets expired sessions and resets, old invitations and old limit windows, and keeps the rest", async () => {
    const store = await createStore();
    const omar = account("omar@example.com");
    await store.createAccount(omar);
    await store.createSession({ tokenHash: "1".repeat(64), userId: omar.id, createdAt: at(0), expiresAt: at(10) });
    await store.createSession({ tokenHash: "2".repeat(64), userId: omar.id, createdAt: at(0), expiresAt: at(50) });
    await store.createReset({ tokenHash: "3".repeat(64), userId: omar.id, createdAt: at(0), expiresAt: at(10) });
    await store.addInvitation(invitation("old@example.com", { expiresAt: at(5) }));
    await store.addInvitation(invitation("recent@example.com", { expiresAt: at(15) }));
    await store.hit("ip:203.0.113.5", at(0), 60_000);
    await store.hit("ip:198.51.100.1", at(25), 60_000);
    await store.forgetExpired({ now: at(20), invitationsBefore: at(10), limitsBefore: at(20) });
    expect(await store.sessionAccount("1".repeat(64), at(5))).toBeNull();
    expect(await store.sessionAccount("2".repeat(64), at(20))).toEqual(omar);
    expect(await store.resetByToken("3".repeat(64))).toBeNull();
    expect((await store.invitations()).map((i) => i.email)).toEqual(["recent@example.com"]);
    expect(await store.hits("ip:203.0.113.5", at(0), 3_600_000)).toBe(0);
    expect(await store.hits("ip:198.51.100.1", at(25), 60_000)).toBe(1);
  });
});

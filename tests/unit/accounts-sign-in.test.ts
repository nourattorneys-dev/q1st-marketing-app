import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { hashPassword } from "@/lib/accounts/passwords";
import { ADDRESS_ATTEMPTS, changePassword, EMAIL_ATTEMPTS, endSession, sessionAccount, signIn, startSession } from "@/lib/accounts/sign-in";
import type { Account, AccountStore } from "@/lib/accounts/store";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 27, 8, minute));
const PASSWORD = "correct horse battery";
let passwordHash: string;
let store: AccountStore;
let sara: Account;
let info: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  store = createMemoryAccountStore();
  sara = { id: "usr_sara", email: "sara@example.com", name: "Sara", role: "admin", clientId: "cli_test", passwordHash, createdAt: at(0), passwordChangedAt: at(0), lastSignInAt: null };
  await store.createAccount(sara);
});

afterEach(() => vi.restoreAllMocks());

const attempt = (email: string, password: string, minute: number, address: string | null = "203.0.113.5") =>
  signIn(store, { email, password, address, now: at(minute) });

describe("signing in (spec M5c)", () => {
  it("signs in with the right password, starts a 30-day session, records the sign-in and logs it", async () => {
    const result = await attempt("sara@example.com", PASSWORD, 1);
    if (!result.ok) throw new Error("expected a sign-in");
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt).toEqual(new Date(at(1).getTime() + 30 * 86_400_000));
    expect(await sessionAccount(store, result.token, at(2))).toMatchObject({ id: "usr_sara" });
    expect(await store.account("usr_sara")).toMatchObject({ lastSignInAt: at(1) });
    expect(info).toHaveBeenCalledWith("Signed in: sara@example.com from 203.0.113.5");
  });

  it("signs in whatever the email's case and spaces (Review Focus 2)", async () => {
    expect((await attempt("  Sara@Example.COM ", PASSWORD, 1)).ok).toBe(true);
  });

  it("gives the same answer for a wrong password and an unknown email, and logs both", async () => {
    expect(await attempt("sara@example.com", "wrong password!", 1)).toEqual({ ok: false, reason: "wrong" });
    expect(await attempt("nobody@example.com", PASSWORD, 1, null)).toEqual({ ok: false, reason: "wrong" });
    expect(warn.mock.calls).toEqual([
      ["Sign-in refused (wrong password): sara@example.com from 203.0.113.5"],
      ["Sign-in refused (wrong password): nobody@example.com from unknown address"],
    ]);
  });

  it("locks an email after 5 failures in 15 minutes, even for the right password, then lets it in again", async () => {
    for (let minute = 0; minute < EMAIL_ATTEMPTS; minute += 1) await attempt("sara@example.com", "wrong password!", minute);
    expect(await attempt("sara@example.com", PASSWORD, 5)).toEqual({ ok: false, reason: "locked" });
    expect(warn).toHaveBeenLastCalledWith("Sign-in refused (locked): sara@example.com from 203.0.113.5");
    expect((await attempt("sara@example.com", PASSWORD, 15)).ok).toBe(true);
  });

  it("a successful sign-in clears that email's count", async () => {
    for (let minute = 0; minute < EMAIL_ATTEMPTS - 1; minute += 1) await attempt("sara@example.com", "wrong password!", minute);
    expect((await attempt("sara@example.com", PASSWORD, 4)).ok).toBe(true);
    for (let minute = 5; minute < 9; minute += 1) await attempt("sara@example.com", "wrong password!", minute);
    expect((await attempt("sara@example.com", PASSWORD, 9)).ok).toBe(true);
  });

  it("locks an address after 30 failures with any emails; with no trustworthy address, only the email limit applies", async () => {
    for (let i = 0; i < ADDRESS_ATTEMPTS; i += 1) await attempt(`guess${i}@example.com`, "wrong password!", 0);
    expect(await attempt("sara@example.com", PASSWORD, 1)).toEqual({ ok: false, reason: "locked" });
    for (let i = 0; i < ADDRESS_ATTEMPTS; i += 1) await attempt(`guess${i}@example.com`, "wrong password!", 0, null);
    expect((await attempt("sara@example.com", PASSWORD, 1, null)).ok).toBe(true);
  });

  it("can't be made to write a forged log line through the email", async () => {
    await attempt("x@example.com\nSigned in: sara@example.com", "wrong password!", 1);
    expect(warn).toHaveBeenLastCalledWith("Sign-in refused (wrong password): x@example.com?signed in: sara@example.com from 203.0.113.5");
  });

  it("parallel attempts can't get past the email limit: at most 5 password checks, even with the right one last (final review)", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => attempt("sara@example.com", i === 19 ? PASSWORD : "wrong password!", 1)));
    expect(results.filter((result) => !result.ok && result.reason === "wrong").length).toBeLessThanOrEqual(5);
    expect(results.at(-1)).toEqual({ ok: false, reason: "locked" });
  });

  it("parallel attempts from one address can't get past its limit either", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => attempt(`guess${i}@example.com`, "wrong password!", 1)));
    expect(results.filter((result) => !result.ok && result.reason === "wrong")).toHaveLength(30);
  });
});

describe("sessions", () => {
  it("ends a session; an unknown token finds nobody", async () => {
    const { token } = await startSession(store, "usr_sara", at(0));
    await endSession(store, token);
    expect(await sessionAccount(store, token, at(1))).toBeNull();
    expect(await sessionAccount(store, "not-a-token", at(1))).toBeNull();
  });
});

describe("changing a password", () => {
  it("needs the current password, applies the rules, and ends the person's other sessions but not this one", async () => {
    const here = await startSession(store, "usr_sara", at(0));
    const elsewhere = await startSession(store, "usr_sara", at(0));
    const change = (current: string, next: string) => changePassword(store, { account: sara, current, next, keepToken: here.token, now: at(5) });
    expect(await change("wrong password!", "a brand new password")).toEqual({ ok: false, problem: "current" });
    expect(await change(PASSWORD, "too short")).toEqual({ ok: false, problem: "short" });
    expect(await change(PASSWORD, "Sara@example.com")).toEqual({ ok: false, problem: "email" });
    expect(await change(PASSWORD, "a brand new password")).toEqual({ ok: true });
    expect(await sessionAccount(store, here.token, at(6))).toMatchObject({ id: "usr_sara" });
    expect(await sessionAccount(store, elsewhere.token, at(6))).toBeNull();
    expect((await attempt("sara@example.com", PASSWORD, 7)).ok).toBe(false);
    expect((await attempt("sara@example.com", "a brand new password", 8)).ok).toBe(true);
    expect(await store.account("usr_sara")).toMatchObject({ passwordChangedAt: at(5) });
  });

  it("counts wrong current passwords like sign-in attempts: after 5, even the right one is refused for a while (final review)", async () => {
    const here = await startSession(store, "usr_sara", at(0));
    const change = (current: string, minute: number) => changePassword(store, { account: sara, current, next: "a brand new password", keepToken: here.token, now: at(minute) });
    for (let i = 0; i < 5; i += 1) expect(await change("wrong password!", 1)).toEqual({ ok: false, problem: "current" });
    expect(await change(PASSWORD, 2)).toEqual({ ok: false, problem: "locked" });
    expect(await change(PASSWORD, 16)).toEqual({ ok: true });
  });
});

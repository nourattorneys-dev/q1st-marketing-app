import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAccountsDirectory } from "@/lib/accounts/accounts-directory";
import { ensureFirstAdmin, maskEmail } from "@/lib/accounts/first-admin";
import { acceptInvitation, INVITATION_DAYS, lookUpInvitation } from "@/lib/accounts/invitations";
import { createMemoryAccountStore } from "@/lib/accounts/memory-store";
import { hashPassword } from "@/lib/accounts/passwords";
import { completeReset, requestReset, resetLinkValid } from "@/lib/accounts/resets";
import { sessionAccount, signIn, startSession } from "@/lib/accounts/sign-in";
import type { Account, AccountStore } from "@/lib/accounts/store";
import { hashToken } from "@/lib/accounts/tokens";
import { createMemoryStore } from "@/lib/db/memory-store";
import { MailError } from "@/lib/notifications/mail-error";
import type { Email, Mailer } from "@/lib/notifications/mailer";

const APP_URL = "https://dashboard.example.com";
const PASSWORD = "correct horse battery";
const DAY = 86_400_000;
const at = (minute: number) => new Date(Date.UTC(2026, 9, 27, 8, minute));
let passwordHash: string;
let store: AccountStore;
let sent: Email[];
let failure: Error | null;
let now: Date;
const mailer: Mailer = {
  async send(email) {
    if (failure) throw failure;
    sent.push(email);
  },
};
const directory = () => createAccountsDirectory({ store, mailer, appUrl: APP_URL, now: () => now });
/** The token in an email's link to `path`, English half. */
const tokenIn = (email: Email | undefined, path: string) => new RegExp(`${APP_URL}/en/${path}\\?token=([A-Za-z0-9_-]+)`).exec(email?.text ?? "")?.[1] ?? "";
const sara = (): Account => ({ id: "usr_sara", email: "sara@example.com", name: "Sara", role: "admin", passwordHash, createdAt: at(0), passwordChangedAt: at(0), lastSignInAt: at(1) });

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  store = createMemoryAccountStore();
  sent = [];
  failure = null;
  now = at(10);
  await store.createAccount(sara());
});

afterEach(() => vi.restoreAllMocks());

describe("invitations on the Users page (spec M5c)", () => {
  it("emails a 7-day link in both languages to the invited email, and lists it", async () => {
    const invite = await directory().invite(" New@Example.com ", "reviewer", "usr_sara");
    expect(invite).toMatchObject({ email: "new@example.com", role: "reviewer", expiresAt: new Date(now.getTime() + INVITATION_DAYS * DAY).toISOString() });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "new@example.com", subject: "You're invited to Articles AI · دعوة إلى Articles AI" });
    expect(sent[0].text).toContain("You're invited to the Articles AI dashboard as Reviewer.");
    expect(sent[0].text).toContain("بصفة مراجع");
    expect(sent[0].text).toContain(`${APP_URL}/ar/invitation?token=`);
    const token = tokenIn(sent[0], "invitation");
    expect(await store.invitationByToken(hashToken(token))).toMatchObject({ id: invite.id, invitedBy: "usr_sara" });
    expect((await directory().list()).invites).toEqual([invite]);
  });

  it("refuses an email that already has an account or an invitation, in any case, or that isn't an email", async () => {
    await expect(directory().invite("SARA@example.com", "reviewer", "usr_sara")).rejects.toMatchObject({ code: "conflict" });
    await directory().invite("new@example.com", "reviewer", "usr_sara");
    await expect(directory().invite(" NEW@example.com", "admin", "usr_sara")).rejects.toMatchObject({ code: "conflict" });
    await expect(directory().invite("not-an-email", "reviewer", "usr_sara")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(directory().invite(`${"a".repeat(250)}@example.com`, "reviewer", "usr_sara")).rejects.toMatchObject({ code: "invalid_input" });
    expect(sent).toHaveLength(1);
  });

  it("keeps nothing when the email can't be sent, and says why", async () => {
    failure = new MailError("login", "535 Incorrect authentication data");
    await expect(directory().invite("new@example.com", "reviewer", "usr_sara")).rejects.toMatchObject({
      code: "mail_failed",
      details: { kind: "login", reply: "535 Incorrect authentication data" },
    });
    expect((await directory().list()).invites).toEqual([]);
  });

  it("resend emails a new link and only then retires the old one; a failed resend changes nothing", async () => {
    const invite = await directory().invite("new@example.com", "reviewer", "usr_sara");
    const first = tokenIn(sent[0], "invitation");
    now = at(20);
    failure = new MailError("connect", null);
    await expect(directory().resendInvite(invite.id)).rejects.toMatchObject({ code: "mail_failed" });
    expect((await lookUpInvitation(store, first, now)).state).toBe("valid");
    failure = null;
    const renewed = await directory().resendInvite(invite.id);
    const second = tokenIn(sent.at(-1), "invitation");
    expect(second).not.toBe(first);
    expect(renewed.expiresAt).toBe(new Date(at(20).getTime() + 7 * DAY).toISOString());
    expect((await lookUpInvitation(store, first, now)).state).toBe("invalid");
    expect((await lookUpInvitation(store, second, now)).state).toBe("valid");
    await expect(directory().resendInvite("inv_missing")).rejects.toMatchObject({ code: "not_found" });
  });

  it("revokes, changes roles, and lists people with their last sign-in", async () => {
    const invite = await directory().invite("new@example.com", "reviewer", "usr_sara");
    expect(await directory().revokeInvite(invite.id)).toEqual({ revoked: true });
    await expect(directory().revokeInvite(invite.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await directory().setRole("usr_sara", "reviewer")).toMatchObject({ id: "usr_sara", role: "reviewer", twoFactor: false });
    await expect(directory().setRole("usr_missing", null)).rejects.toMatchObject({ code: "not_found" });
    expect((await directory().list()).users).toEqual([
      { id: "usr_sara", name: "Sara", email: "sara@example.com", role: "reviewer", twoFactor: false, lastSignInAt: at(1).toISOString() },
    ]);
  });
});

describe("accepting an invitation", () => {
  async function invited(email = "new@example.com") {
    await directory().invite(email, "reviewer", "usr_sara");
    return tokenIn(sent.at(-1), "invitation");
  }

  it("creates the account with the invited role and signs in, once (Review Focus 3)", async () => {
    const token = await invited();
    const result = await acceptInvitation(store, { token, name: "  Omar  ", password: PASSWORD, now: at(11) });
    if (!result.ok) throw new Error(result.problem);
    expect(result.account).toMatchObject({ email: "new@example.com", name: "Omar", role: "reviewer", lastSignInAt: at(11) });
    expect(await sessionAccount(store, result.token, at(12))).toMatchObject({ email: "new@example.com" });
    expect(await acceptInvitation(store, { token, name: "Omar", password: PASSWORD, now: at(12) })).toEqual({ ok: false, problem: "invalid" });
  });

  it("an expired invitation says so, from the exact moment it expires", async () => {
    const token = await invited();
    const expiry = new Date(now.getTime() + 7 * DAY);
    expect((await lookUpInvitation(store, token, new Date(expiry.getTime() - 1))).state).toBe("valid");
    expect(await acceptInvitation(store, { token, name: "Omar", password: PASSWORD, now: expiry })).toEqual({ ok: false, problem: "expired" });
  });

  it("checks the name and the password rules, and creates nothing until they pass", async () => {
    const token = await invited();
    expect(await acceptInvitation(store, { token, name: "   ", password: PASSWORD, now: at(11) })).toEqual({ ok: false, problem: "name" });
    expect(await acceptInvitation(store, { token, name: "Omar", password: "too short", now: at(11) })).toEqual({ ok: false, problem: "short" });
    expect(await acceptInvitation(store, { token, name: "Omar", password: "New@Example.com", now: at(11) })).toEqual({ ok: false, problem: "email" });
    expect(await store.accountByEmail("new@example.com")).toBeNull();
  });

  it("can't be accepted for an email that meanwhile got an account (Review Focus 3)", async () => {
    const token = await invited();
    await store.createAccount({ ...sara(), id: "usr_other", email: "new@example.com", role: "reviewer" });
    expect(await acceptInvitation(store, { token, name: "Omar", password: PASSWORD, now: at(11) })).toEqual({ ok: false, problem: "taken" });
    expect((await store.accounts()).filter((account) => account.email === "new@example.com")).toHaveLength(1);
  });
});

describe("forgot password", () => {
  const later: Array<Promise<void>> = [];
  const deps = () => ({ store, mailer, appUrl: APP_URL, later: (task: () => Promise<void>) => void later.push(task()) });
  const settle = async () => {
    await Promise.all(later.splice(0));
  };

  it("asks for a reset whatever the email's case and spaces, and emails a 1-hour link (Review Focus 2)", async () => {
    await requestReset(deps(), { email: "  SARA@example.com ", now });
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "sara@example.com", subject: "Reset your Articles AI password · إعادة تعيين كلمة مرور Articles AI" });
    const token = tokenIn(sent[0], "reset-password");
    expect(await resetLinkValid(store, token, new Date(now.getTime() + 59 * 60_000))).toBe(true);
    expect(await resetLinkValid(store, token, new Date(now.getTime() + 60 * 60_000))).toBe(false);
  });

  it("answers an unknown email the same way, sending nothing", async () => {
    await expect(requestReset(deps(), { email: "nobody@example.com", now })).resolves.toBeUndefined();
    await settle();
    expect(sent).toEqual([]);
  });

  it("sends at most 3 reset emails to one address per hour", async () => {
    for (let i = 0; i < 5; i += 1) await requestReset(deps(), { email: "sara@example.com", now });
    await settle();
    expect(sent).toHaveLength(3);
  });

  it("logs a failed reset email with its kind, without telling the visitor", async () => {
    failure = new MailError("connect", "connect ECONNREFUSED 127.0.0.1:587");
    await requestReset(deps(), { email: "sara@example.com", now });
    await settle();
    expect(console.error).toHaveBeenCalledWith("Password reset email failed (connect): connect ECONNREFUSED 127.0.0.1:587");
  });

  it("a reset link sets the password, ends every session, signs in, and works once", async () => {
    const before = await startSession(store, "usr_sara", now);
    await requestReset(deps(), { email: "sara@example.com", now });
    await settle();
    const token = tokenIn(sent[0], "reset-password");
    expect(await completeReset(store, { token, password: "short", now: at(11) })).toEqual({ ok: false, problem: "short" });
    const result = await completeReset(store, { token, password: "a brand new password", now: at(11) });
    if (!result.ok) throw new Error(result.problem);
    expect(await sessionAccount(store, before.token, at(12))).toBeNull();
    expect(await sessionAccount(store, result.token, at(12))).toMatchObject({ id: "usr_sara" });
    expect(await completeReset(store, { token, password: "another new password", now: at(12) })).toEqual({ ok: false, problem: "invalid" });
    expect((await signIn(store, { email: "sara@example.com", password: PASSWORD, address: null, now: at(13) })).ok).toBe(false);
    expect((await signIn(store, { email: "sara@example.com", password: "a brand new password", address: null, now: at(14) })).ok).toBe(true);
  });

  it("a completed reset lifts the sign-in lock on that email (final review)", async () => {
    for (let i = 0; i < 5; i += 1) await signIn(store, { email: "sara@example.com", password: "wrong password!", address: null, now });
    expect(await signIn(store, { email: "sara@example.com", password: PASSWORD, address: null, now })).toEqual({ ok: false, reason: "locked" });
    await requestReset(deps(), { email: "sara@example.com", now });
    await settle();
    const token = tokenIn(sent.at(-1), "reset-password");
    expect((await completeReset(store, { token, password: "a brand new password", now })).ok).toBe(true);
    expect((await signIn(store, { email: "sara@example.com", password: "a brand new password", address: null, now })).ok).toBe(true);
  });
});

describe("the first Admin", () => {
  const appStore = createMemoryStore();
  const ensure = (adminEmail: string | null = "owner@example.com") =>
    ensureFirstAdmin({ store, exclusive: appStore.exclusive, mailer, appUrl: APP_URL, adminEmail, now });

  beforeEach(async () => {
    await store.setRole("usr_sara", "reviewer");
  });

  it("with no Admin, invites ADMIN_EMAIL once, and again only after that link expired", async () => {
    expect(await ensure()).toEqual({ state: "invited", to: "o•••@example.com" });
    expect(sent.map((email) => email.to)).toEqual(["owner@example.com"]);
    expect(sent[0].text).toContain("as Admin.");
    expect(await ensure()).toEqual({ state: "invited", to: "o•••@example.com" });
    expect(sent).toHaveLength(1);
    now = new Date(now.getTime() + 7 * DAY);
    await ensure();
    expect(sent).toHaveLength(2);
  });

  it("does nothing once an Admin exists, and makes an existing account at ADMIN_EMAIL the Admin", async () => {
    expect(await ensure("sara@example.com")).toEqual({ state: "ready" });
    expect(await store.account("usr_sara")).toMatchObject({ role: "admin" });
    expect(await ensure()).toEqual({ state: "ready" });
    expect(sent).toEqual([]);
  });

  it("without ADMIN_EMAIL, says so", async () => {
    expect(await ensure(null)).toEqual({ state: "unset" });
  });

  it("a mail failure leaves no invitation, and it stops trying after 3 attempts in 15 minutes", async () => {
    let attempts = 0;
    failure = new MailError("login", "535 Incorrect authentication data");
    const counting: Mailer = {
      async send(email) {
        attempts += 1;
        return mailer.send(email);
      },
    };
    const attempt = () => ensureFirstAdmin({ store, exclusive: appStore.exclusive, mailer: counting, appUrl: APP_URL, adminEmail: "owner@example.com", now });
    for (let i = 0; i < 4; i += 1) expect(await attempt()).toEqual({ state: "failed" });
    expect(attempts).toBe(3);
    expect(await store.invitations()).toEqual([]);
  });

  it("two visitors at once send one email", async () => {
    await Promise.all([ensure(), ensure()]);
    expect(sent).toHaveLength(1);
  });

  it("hides most of the address on the sign-in page", () => {
    expect(maskEmail("owner@example.com")).toBe("o•••@example.com");
  });

  it("a corrected ADMIN_EMAIL retires the invitation sent to the earlier address (final review)", async () => {
    await ensure("typo@example.com");
    const typoToken = tokenIn(sent[0], "invitation");
    await ensure("owner@example.com");
    expect(sent.map((email) => email.to)).toEqual(["typo@example.com", "owner@example.com"]);
    expect((await lookUpInvitation(store, typoToken, now)).state).toBe("invalid");
  });
});

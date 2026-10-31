import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/accounts/passwords";
import { sessionAccount, startSession } from "@/lib/accounts/sign-in";
import { hashToken, newToken } from "@/lib/accounts/tokens";
import { getAccountStore } from "@/lib/db";
import { createLogMailer } from "@/lib/notifications/mailer";

const state = vi.hoisted(() => ({ jar: new Map<string, string>(), set: [] as string[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { name, value: state.jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      state.set.push(name);
      state.jar.set(name, value);
    },
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => void task(),
}));
const requireSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ requireSession }));

const { acceptInvitationAction } = await import("@/app/[locale]/invitation/actions");
const { requestResetAction } = await import("@/app/[locale]/forgot-password/actions");
const { resetPasswordAction } = await import("@/app/[locale]/reset-password/actions");
const { changePasswordAction } = await import("@/app/[locale]/security/actions");

const PASSWORD = "correct horse battery";
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};
let passwordHash: string;
let sequence = 0;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  state.jar.clear();
  state.set = [];
  requireSession.mockReset();
  vi.stubEnv("AUTH_MODE", "password");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("DB_MODE", "memory");
  vi.stubEnv("EMAIL_MODE", "log");
  vi.stubEnv("ENGINE_MODE", "mock");
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function account(): Promise<{ id: string; email: string }> {
  const id = `usr_actions${++sequence}`;
  const now = new Date();
  await getAccountStore().createAccount({ id, email: `${id}@example.com`, name: "Omar", role: "reviewer", clientId: "cli_test", passwordHash, createdAt: now, passwordChangedAt: now, lastSignInAt: null });
  return { id, email: `${id}@example.com` };
}

describe("accepting an invitation (spec M5c)", () => {
  it("refuses two different passwords first, keeping the name", async () => {
    expect(await acceptInvitationAction(null, form({ locale: "en", token: "x", name: "Omar", password: PASSWORD, confirm: "something else" }))).toEqual({
      problem: "mismatch",
      name: "Omar",
    });
  });

  it("creates the account, sets the session cookie and opens the dashboard", async () => {
    const token = newToken();
    const now = new Date();
    const email = `new${++sequence}@example.com`;
    await getAccountStore().addInvitation({ id: `inv_actions${sequence}`, email, role: "reviewer", clientId: "cli_test", siteIds: null, tokenHash: hashToken(token), invitedBy: null, createdAt: now, expiresAt: new Date(now.getTime() + 86_400_000) });
    await expect(acceptInvitationAction(null, form({ locale: "ar", token, name: "Omar", password: PASSWORD, confirm: PASSWORD }))).rejects.toThrow("REDIRECT:/ar");
    expect(state.set).toEqual(["session"]);
    const made = (await getAccountStore().accountByEmail(email))!;
    expect(made).toMatchObject({ name: "Omar" });
    expect(await getAccountStore().member(made.id, "cli_test")).toMatchObject({ role: "reviewer" });
  });
});

describe("forgot password", () => {
  it("gives the same answer for a known and an unknown email, emails only the known one, and asks for an email", async () => {
    const known = await account();
    const before = createLogMailer().outbox().length;
    expect(await requestResetAction(null, form({ email: known.email }))).toEqual({ sent: true });
    expect(await requestResetAction(null, form({ email: "nobody@example.com" }))).toEqual({ sent: true });
    await vi.waitFor(() => expect(createLogMailer().outbox().length - before).toBe(1));
    expect(createLogMailer().outbox().at(-1)?.to).toBe(known.email);
    expect(await requestResetAction(null, form({ email: "  " }))).toEqual({ problem: "empty" });
  });
});

describe("resetting a password", () => {
  it("refuses an unknown link and two different passwords", async () => {
    expect(await resetPasswordAction(null, form({ locale: "en", token: "nonsense", password: "a brand new password", confirm: "a brand new password" }))).toEqual({ problem: "invalid" });
    expect(await resetPasswordAction(null, form({ locale: "en", token: "nonsense", password: "a brand new password", confirm: "different" }))).toEqual({ problem: "mismatch" });
  });
});

describe("changing a password on the Account page", () => {
  it("needs the current password, keeps this session and ends the others", async () => {
    const me = await account();
    const store = getAccountStore();
    const here = await startSession(store, me.id, new Date());
    const elsewhere = await startSession(store, me.id, new Date());
    state.jar.set("session", here.token);
    requireSession.mockResolvedValue({ userId: me.id, email: me.email, name: "Omar", role: "reviewer", twoFactor: false });
    const change = (current: string, password: string, confirm = password) => changePasswordAction(null, form({ locale: "en", current, password, confirm }));
    expect(await change("wrong password!", "a brand new password")).toEqual({ problem: "current" });
    expect(await change(PASSWORD, "a brand new password", "different")).toEqual({ problem: "mismatch" });
    expect(await change(PASSWORD, "a brand new password")).toEqual({ changed: true });
    expect(await sessionAccount(store, here.token, new Date())).not.toBeNull();
    expect(await sessionAccount(store, elsewhere.token, new Date())).toBeNull();
    expect(requireSession).toHaveBeenCalledWith("en");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DirectoryError } from "@/lib/users/types";

const directory = { list: vi.fn(), invite: vi.fn(), resendInvite: vi.fn(), revokeInvite: vi.fn(), setRole: vi.fn() };
const refresh = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh }));
const requirePermission = vi.fn(async () => ({ userId: "user_admin", email: "admin@example.com", name: "Admin", role: "admin", twoFactor: true }));
vi.mock("@/lib/auth/session", () => ({ requirePermission }));
vi.mock("@/lib/users/directory", () => ({ getDirectory: async () => directory }));

const { inviteUserAction, resendInviteAction, revokeInviteAction, setUserRoleAction } = await import("@/app/[locale]/(app)/users/actions");

const key = "key-12345678";

beforeEach(() => {
  vi.clearAllMocks();
  directory.invite.mockResolvedValue({ id: "inv_1", email: "new@example.com", role: "reviewer", createdAt: "2026-10-21T08:00:00.000Z", expiresAt: "2026-10-28T08:00:00.000Z" });
  directory.resendInvite.mockResolvedValue({ id: "inv_1", email: "new@example.com", role: "reviewer", createdAt: "2026-10-27T08:00:00.000Z", expiresAt: "2026-11-03T08:00:00.000Z" });
  directory.revokeInvite.mockResolvedValue({ revoked: true });
  directory.setRole.mockResolvedValue({ id: "user_2", name: "Omar", email: "omar@example.com", role: null, twoFactor: false, lastSignInAt: null });
});

describe("users actions are for admins (design §5: users.manage)", () => {
  it("checks users.manage before every change, and refreshes the page after a success", async () => {
    await inviteUserAction({ locale: "en", email: "new@example.com", role: "reviewer", idempotencyKey: key });
    await revokeInviteAction({ locale: "en", inviteId: "inv_1", idempotencyKey: key });
    await resendInviteAction({ locale: "en", inviteId: "inv_1", idempotencyKey: key });
    await setUserRoleAction({ locale: "ar", userId: "user_2", role: null, idempotencyKey: key });
    expect(requirePermission.mock.calls).toEqual([
      ["en", "users.manage"],
      ["en", "users.manage"],
      ["en", "users.manage"],
      ["ar", "users.manage"],
    ]);
    expect(directory.invite).toHaveBeenCalledWith("new@example.com", "reviewer", "user_admin");
    expect(directory.revokeInvite).toHaveBeenCalledWith("inv_1");
    expect(directory.setRole).toHaveBeenCalledWith("user_2", null);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it("refuses an Admin's change to their own access, without asking the directory (Review Focus 1)", async () => {
    expect(await setUserRoleAction({ locale: "en", userId: "user_admin", role: "reviewer", idempotencyKey: key })).toEqual({
      ok: false,
      error: { status: 403, code: "self", message: "You can't change your own access." },
    });
    expect(directory.setRole).not.toHaveBeenCalled();
  });

  it("refuses a malformed id or role without asking the directory", async () => {
    for (const userId of ["..", "a/b", "user_1?x=1", ""]) {
      expect(await setUserRoleAction({ locale: "en", userId, role: "admin", idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(await setUserRoleAction({ locale: "en", userId: "user_2", role: "owner" as never, idempotencyKey: key })).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(await revokeInviteAction({ locale: "en", inviteId: "../users", idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await inviteUserAction({ locale: "en", email: "x@example.com", role: "owner" as never, idempotencyKey: key })).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(directory.setRole).not.toHaveBeenCalled();
    expect(directory.revokeInvite).not.toHaveBeenCalled();
    expect(directory.invite).not.toHaveBeenCalled();
  });

  it("returns the directory's refusal with its status, and doesn't refresh (Review Focus 3 and 4)", async () => {
    directory.invite.mockRejectedValue(new DirectoryError("conflict", "This person already has an account or an invitation."));
    expect(await inviteUserAction({ locale: "en", email: "Omar@example.com", role: "reviewer", idempotencyKey: key })).toEqual({
      ok: false,
      error: { status: 409, code: "conflict", message: "This person already has an account or an invitation." },
    });
    directory.invite.mockRejectedValue(new DirectoryError("invalid_input", "Enter an email address.", { email: "Enter an email address." }));
    expect(await inviteUserAction({ locale: "en", email: "not-an-email", role: "reviewer", idempotencyKey: key })).toMatchObject({
      ok: false,
      error: { status: 400, code: "invalid_input", fields: { email: "Enter an email address." } },
    });
    directory.setRole.mockRejectedValue(new DirectoryError("unavailable", "The sign-in service can't be reached right now. Try again shortly."));
    expect(await setUserRoleAction({ locale: "en", userId: "user_2", role: "reviewer", idempotencyKey: key })).toMatchObject({
      ok: false,
      error: { status: 503, code: "unavailable" },
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("resends an invitation for Admins only, refreshing the page (spec M5c)", async () => {
    expect(await resendInviteAction({ locale: "en", inviteId: "inv_1", idempotencyKey: key })).toMatchObject({ ok: true, data: { id: "inv_1", notSent: false } });
    expect(requirePermission).toHaveBeenCalledWith("en", "users.manage");
    expect(directory.resendInvite).toHaveBeenCalledWith("inv_1");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await resendInviteAction({ locale: "en", inviteId: "../x", idempotencyKey: key })).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });

  it("marks an invitation not sent in password mode while EMAIL_MODE=log", async () => {
    vi.stubEnv("AUTH_MODE", "password");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("EMAIL_MODE", "log");
    expect(await inviteUserAction({ locale: "en", email: "new@example.com", role: "reviewer", idempotencyKey: key })).toMatchObject({ ok: true, data: { notSent: true } });
    vi.unstubAllEnvs();
  });

  it("passes a mail failure through with its kind and the server's reply", async () => {
    directory.invite.mockRejectedValue(new DirectoryError("mail_failed", "The email couldn't be sent (login).", undefined, { kind: "login", reply: "535 x" }));
    expect(await inviteUserAction({ locale: "en", email: "new@example.com", role: "reviewer", idempotencyKey: key })).toEqual({
      ok: false,
      error: { status: 502, code: "mail_failed", message: "The email couldn't be sent (login).", details: { kind: "login", reply: "535 x" } },
    });
  });
});

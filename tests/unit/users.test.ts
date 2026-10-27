import { describe, expect, it } from "vitest";
import { createMockDirectory } from "@/lib/users/mock-directory";
import { alreadyKnown, canChangeAccess, normalizeEmail } from "@/lib/users/rules";
import { DirectoryError, tryDirectory } from "@/lib/users/types";

let sequence = 0;
const fresh = () => createMockDirectory(`users${++sequence}${Date.now().toString(36)}`);

describe("user rules (design §5)", () => {
  it("compares emails trimmed and in lower case", () => {
    expect(normalizeEmail("  New.Reviewer@Example.com ")).toBe("new.reviewer@example.com");
  });

  it("knows an email that already has an account or an invitation, in any capitalisation (Review Focus 3)", () => {
    expect(alreadyKnown("ADMIN@example.com", [{ email: "admin@example.com" }], [])).toBe(true);
    expect(alreadyKnown(" x@example.com", [], [{ email: "X@Example.com" }])).toBe(true);
    expect(alreadyKnown("y@example.com", [{ email: "admin@example.com" }], [])).toBe(false);
  });

  it("nobody changes their own access, so the site can't lose its last Admin (Review Focus 1)", () => {
    expect([canChangeAccess("u1", "u1"), canChangeAccess("u1", "u2")]).toEqual([false, true]);
  });
});

describe("the test directory (AUTH_MODE=mock)", () => {
  it("starts with the test users, their roles and two-factor status", async () => {
    const { users, invites } = await fresh().list();
    expect(users.map((user) => [user.id, user.role, user.twoFactor])).toEqual([
      ["dev_admin", "admin", true],
      ["dev_reviewer", "reviewer", false],
      ["dev_norole", null, false],
      ["dev_admin_no2fa", "admin", false],
    ]);
    expect(invites).toEqual([]);
  });

  it("invites an email once, ignoring case and spaces; refuses an existing account or a non-email; revokes (Review Focus 3)", async () => {
    const directory = fresh();
    const invite = await directory.invite(" New.Reviewer@example.com ", "reviewer", null);
    expect(invite).toMatchObject({ email: "new.reviewer@example.com", role: "reviewer" });
    expect(new Date(invite.expiresAt ?? 0).getTime() - new Date(invite.createdAt).getTime()).toBe(7 * 86_400_000);
    await expect(directory.invite("NEW.reviewer@example.com", "admin", null)).rejects.toMatchObject({ code: "conflict" });
    await expect(directory.invite("Reviewer@Example.com", "admin", null)).rejects.toMatchObject({ code: "conflict" });
    await expect(directory.invite("not-an-email", "reviewer", null)).rejects.toMatchObject({ code: "invalid_input", fields: { email: expect.any(String) } });
    expect(await directory.revokeInvite(invite.id)).toEqual({ revoked: true });
    expect((await directory.list()).invites).toEqual([]);
    await expect(directory.revokeInvite(invite.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("changes a role, and the person's session follows it (Review Focus 1)", async () => {
    const directory = fresh();
    expect((await directory.setRole("dev_reviewer", null)).role).toBeNull();
    expect(directory.sessionOf("dev_reviewer")).toMatchObject({ role: null });
    expect((await directory.setRole("dev_reviewer", "reviewer")).role).toBe("reviewer");
    await expect(directory.setRole("nobody", "admin")).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps each mock_store namespace apart, like the mock engine", async () => {
    const stamp = Date.now().toString(36);
    const a = createMockDirectory(`usersA${stamp}`);
    const b = createMockDirectory(`usersB${stamp}`);
    await a.setRole("dev_reviewer", "admin");
    expect(b.sessionOf("dev_reviewer")?.role).toBe("reviewer");
    expect(createMockDirectory(`usersA${stamp}`).sessionOf("dev_reviewer")?.role).toBe("admin");
  });

  it("turns on two-factor login for a test user, and knows no one else", () => {
    const directory = fresh();
    directory.enableTwoFactor("dev_admin_no2fa");
    expect(directory.sessionOf("dev_admin_no2fa")).toMatchObject({ role: "admin", twoFactor: true });
    expect(directory.sessionOf("someone")).toBeNull();
  });

  it("resends a test invitation with a new 7-day expiry, and knows a missing one", async () => {
    const directory = fresh();
    const invite = await directory.invite("new@example.com", "reviewer", null);
    const renewed = await directory.resendInvite(invite.id);
    expect(renewed).toMatchObject({ id: invite.id, email: "new@example.com" });
    expect(new Date(renewed.expiresAt ?? 0).getTime() - new Date(renewed.createdAt).getTime()).toBe(7 * 86_400_000);
    await expect(directory.resendInvite("inv_missing")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("tryDirectory", () => {
  it("turns a directory error into an action result with a status, and lets other errors through", async () => {
    expect(
      await tryDirectory(async () => {
        throw new DirectoryError("conflict", "Already there.");
      }),
    ).toEqual({ ok: false, error: { status: 409, code: "conflict", message: "Already there." } });
    expect(
      await tryDirectory(async () => {
        throw new DirectoryError("mail_failed", "The email couldn't be sent (login).", undefined, { kind: "login", reply: "535 x" });
      }),
    ).toEqual({ ok: false, error: { status: 502, code: "mail_failed", message: "The email couldn't be sent (login).", details: { kind: "login", reply: "535 x" } } });
    await expect(
      tryDirectory(async () => {
        throw new Error("bug");
      }),
    ).rejects.toThrow("bug");
  });
});

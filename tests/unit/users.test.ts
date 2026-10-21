import { describe, expect, it } from "vitest";
import { createClerkDirectory, type ClerkDirectoryClient } from "@/lib/users/clerk-directory";
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
    const invite = await directory.invite(" New.Reviewer@example.com ", "reviewer");
    expect(invite).toMatchObject({ email: "new.reviewer@example.com", role: "reviewer" });
    await expect(directory.invite("NEW.reviewer@example.com", "admin")).rejects.toMatchObject({ code: "conflict" });
    await expect(directory.invite("Reviewer@Example.com", "admin")).rejects.toMatchObject({ code: "conflict" });
    await expect(directory.invite("not-an-email", "reviewer")).rejects.toMatchObject({ code: "invalid_input", fields: { email: expect.any(String) } });
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
});

type Call = [string, ...unknown[]];

function fakeClerk() {
  const calls: Call[] = [];
  const client: ClerkDirectoryClient = {
    users: {
      getUserList: async (params) => {
        calls.push(["getUserList", params]);
        return {
          data: [
            {
              id: "user_1",
              fullName: "Sara Ali",
              primaryEmailAddress: { emailAddress: "sara@example.com" },
              publicMetadata: { role: "admin" },
              twoFactorEnabled: true,
              lastSignInAt: Date.parse("2026-10-21T05:00:00Z"),
            },
            { id: "user_2", fullName: null, primaryEmailAddress: { emailAddress: "omar@example.com" }, publicMetadata: { role: "owner" }, twoFactorEnabled: false, lastSignInAt: null },
          ],
        };
      },
      updateUserMetadata: async (userId, params) => {
        calls.push(["updateUserMetadata", userId, params]);
        return { id: userId, fullName: "Omar", primaryEmailAddress: { emailAddress: "omar@example.com" }, publicMetadata: params.publicMetadata, twoFactorEnabled: false, lastSignInAt: null };
      },
    },
    invitations: {
      getInvitationList: async (params) => {
        calls.push(["getInvitationList", params]);
        return { data: [{ id: "inv_1", emailAddress: "new@example.com", publicMetadata: { role: "reviewer" }, createdAt: Date.parse("2026-10-20T08:00:00Z") }] };
      },
      createInvitation: async (params) => {
        calls.push(["createInvitation", params]);
        return { id: "inv_2", emailAddress: params.emailAddress, publicMetadata: params.publicMetadata, createdAt: Date.parse("2026-10-21T08:00:00Z") };
      },
      revokeInvitation: async (invitationId) => {
        calls.push(["revokeInvitation", invitationId]);
        return { id: invitationId, emailAddress: "new@example.com", publicMetadata: null, createdAt: 0 };
      },
    },
  };
  return { client, calls };
}

describe("the Clerk directory (AUTH_MODE=clerk), over a fake Clerk client", () => {
  it("lists users with the role from public metadata, and pending invitations", async () => {
    const { client, calls } = fakeClerk();
    expect(await createClerkDirectory(client).list()).toEqual({
      users: [
        { id: "user_1", name: "Sara Ali", email: "sara@example.com", role: "admin", twoFactor: true, lastSignInAt: "2026-10-21T05:00:00.000Z" },
        { id: "user_2", name: "omar@example.com", email: "omar@example.com", role: null, twoFactor: false, lastSignInAt: null },
      ],
      invites: [{ id: "inv_1", email: "new@example.com", role: "reviewer", createdAt: "2026-10-20T08:00:00.000Z" }],
    });
    expect(calls).toContainEqual(["getUserList", { limit: 100, orderBy: "-created_at" }]);
    expect(calls).toContainEqual(["getInvitationList", { status: "pending", limit: 100 }]);
  });

  it("invites with the role in public metadata and Clerk's email; sets and removes a role; revokes", async () => {
    const { client, calls } = fakeClerk();
    const directory = createClerkDirectory(client);
    expect(await directory.invite(" Brand.New@example.com", "reviewer")).toEqual({
      id: "inv_2",
      email: "brand.new@example.com",
      role: "reviewer",
      createdAt: "2026-10-21T08:00:00.000Z",
    });
    await directory.setRole("user_2", "reviewer");
    await directory.setRole("user_2", null);
    expect(await directory.revokeInvite("inv_1")).toEqual({ revoked: true });
    expect(calls.filter(([name]) => name !== "getUserList" && name !== "getInvitationList")).toEqual([
      ["createInvitation", { emailAddress: "brand.new@example.com", publicMetadata: { role: "reviewer" }, notify: true }],
      ["updateUserMetadata", "user_2", { publicMetadata: { role: "reviewer" } }],
      ["updateUserMetadata", "user_2", { publicMetadata: { role: null } }],
      ["revokeInvitation", "inv_1"],
    ]);
  });

  it("refuses an email that already has an account or an invitation before asking Clerk (Review Focus 3)", async () => {
    const { client, calls } = fakeClerk();
    await expect(createClerkDirectory(client).invite("SARA@example.com", "admin")).rejects.toMatchObject({ code: "conflict" });
    await expect(createClerkDirectory(client).invite("New@Example.com", "admin")).rejects.toMatchObject({ code: "conflict" });
    expect(calls.some(([name]) => name === "createInvitation")).toBe(false);
  });

  it("turns Clerk's errors into the portal's: a duplicate is a conflict, a missing record not_found, anything else unavailable (Review Focus 4)", async () => {
    const { client } = fakeClerk();
    client.invitations.createInvitation = async () => {
      throw Object.assign(new Error("duplicate"), { status: 422, errors: [{ code: "duplicate_record" }] });
    };
    await expect(createClerkDirectory(client).invite("x@example.com", "reviewer")).rejects.toMatchObject({ code: "conflict" });
    client.invitations.revokeInvitation = async () => {
      throw Object.assign(new Error("gone"), { status: 404, errors: [{ code: "resource_not_found" }] });
    };
    await expect(createClerkDirectory(client).revokeInvite("inv_9")).rejects.toMatchObject({ code: "not_found" });
    client.users.getUserList = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(createClerkDirectory(client).list()).rejects.toMatchObject({ code: "unavailable" });
  });
  it("tells a refusal (400, 403, 422) apart from the service being down (M4b follow-up; Review Focus 5)", async () => {
    for (const status of [400, 403, 422]) {
      const { client } = fakeClerk();
      client.users.updateUserMetadata = async () => {
        throw Object.assign(new Error("refused"), { status, errors: [{ code: "form_param_format_invalid" }] });
      };
      await expect(createClerkDirectory(client).setRole("user_2", "reviewer")).rejects.toMatchObject({ code: "refused" });
    }
    const { client } = fakeClerk();
    client.users.updateUserMetadata = async () => {
      throw Object.assign(new Error("boom"), { status: 500, errors: [{ code: "unexpected_error" }] });
    };
    await expect(createClerkDirectory(client).setRole("user_2", "reviewer")).rejects.toMatchObject({ code: "unavailable" });
    expect(
      await tryDirectory(async () => {
        throw new DirectoryError("refused", "The sign-in service refused this.");
      }),
    ).toMatchObject({ ok: false, error: { status: 422, code: "refused" } });
  });
});

describe("tryDirectory", () => {
  it("turns a directory error into an action result with a status, and lets other errors through", async () => {
    expect(
      await tryDirectory(async () => {
        throw new DirectoryError("conflict", "Already there.");
      }),
    ).toEqual({ ok: false, error: { status: 409, code: "conflict", message: "Already there." } });
    await expect(
      tryDirectory(async () => {
        throw new Error("bug");
      }),
    ).rejects.toThrow("bug");
  });
});

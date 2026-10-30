import type { Role } from "@/lib/auth/roles";
import { MOCK_CLIENT_ID, MOCK_USERS } from "@/lib/auth/mock-session";
import type { Session } from "@/lib/auth/types";
import { alreadyKnown, validInviteEmail } from "./rules";
import { DirectoryError, type DirectoryInvite, type DirectoryUser, type UserDirectory } from "./types";

type State = { users: Map<string, DirectoryUser>; invites: Map<string, DirectoryInvite>; sequence: number };

const REGISTRY = Symbol.for("articles-ai.mock-directories");
const SIGNED_IN_BEFORE = "2026-10-21T05:00:00.000Z";
const INVITE_DAYS_MS = 7 * 86_400_000;

/** One test directory per mock_store namespace (e2e tests use a fresh one each), seeded with the test users. */
function stateFor(namespace?: string): State {
  const holder = globalThis as unknown as Record<symbol, Map<string, State> | undefined>;
  const states = (holder[REGISTRY] ??= new Map<string, State>());
  const key = namespace && /^[A-Za-z0-9_-]{1,64}$/.test(namespace) ? namespace : "default";
  let state = states.get(key);
  if (!state) {
    state = {
      users: new Map(
        MOCK_USERS.map((user) => [
          user.userId,
          {
            id: user.userId,
            name: user.name,
            email: user.email,
            role: user.role,
            twoFactor: user.twoFactor,
            siteIds: null,
            lastSignInAt: user.role ? SIGNED_IN_BEFORE : null,
          },
        ]),
      ),
      invites: new Map(),
      sequence: 0,
    };
    states.set(key, state);
  }
  return state;
}

export function createMockDirectory(namespace?: string): UserDirectory & {
  sessionOf(userId: string): Session | null;
  enableTwoFactor(userId: string): void;
} {
  const state = stateFor(namespace);

  return {
    async list() {
      return { users: structuredClone([...state.users.values()]), invites: structuredClone([...state.invites.values()]) };
    },

    async invite(email: string, role: Role) {
      const tidy = validInviteEmail(email);
      if (alreadyKnown(tidy, [...state.users.values()], [...state.invites.values()])) {
        throw new DirectoryError("conflict", "This person already has an account or an invitation.");
      }
      const createdAt = new Date();
      const invite: DirectoryInvite = {
        id: `inv_${++state.sequence}`,
        email: tidy,
        role,
        siteIds: null,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + INVITE_DAYS_MS).toISOString(),
      };
      state.invites.set(invite.id, invite);
      return structuredClone(invite);
    },

    async resendInvite(id: string) {
      const invite = state.invites.get(id);
      if (!invite) throw new DirectoryError("not_found", "This invitation no longer exists.");
      const createdAt = new Date();
      Object.assign(invite, { createdAt: createdAt.toISOString(), expiresAt: new Date(createdAt.getTime() + INVITE_DAYS_MS).toISOString() });
      return structuredClone(invite);
    },

    async revokeInvite(id: string) {
      if (!state.invites.delete(id)) throw new DirectoryError("not_found", "This invitation no longer exists.");
      return { revoked: true as const };
    },

    async setRole(userId: string, role: Role | null) {
      const user = state.users.get(userId);
      if (!user) throw new DirectoryError("not_found", "This person no longer exists.");
      user.role = role;
      return structuredClone(user);
    },

    /** Test logins have one site, so there is nothing to limit. */
    async setSites(userId: string) {
      const user = state.users.get(userId);
      if (!user) throw new DirectoryError("not_found", "This person no longer exists.");
      return structuredClone(user);
    },

    /** The session a test login gets: the directory's current role and two-factor status. */
    sessionOf(userId: string): Session | null {
      const user = state.users.get(userId);
      return user ? { userId: user.id, clientId: MOCK_CLIENT_ID, email: user.email, name: user.name, role: user.role, twoFactor: user.twoFactor } : null;
    },

    /** Stands in for setting up an authenticator app (test logins only). */
    enableTwoFactor(userId: string) {
      const user = state.users.get(userId);
      if (user) user.twoFactor = true;
    },
  };
}

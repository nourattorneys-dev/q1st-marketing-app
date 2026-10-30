import type { Role } from "@/lib/auth/roles";

/** Someone who can sign in (spec M5c). The email is stored trimmed and lowercased, at most 254 characters. */
export type Account = {
  id: string;
  email: string;
  name: string;
  role: Role | null;
  passwordHash: string;
  createdAt: Date;
  passwordChangedAt: Date;
  lastSignInAt: Date | null;
};
export type Invitation = { id: string; email: string; role: Role; tokenHash: string; invitedBy: string | null; createdAt: Date; expiresAt: Date };
export type PasswordReset = { tokenHash: string; userId: string; createdAt: Date; expiresAt: Date };
export type SessionRecord = { tokenHash: string; userId: string; createdAt: Date; expiresAt: Date };

/** The accounts behind this dashboard and their sign-in state: in memory locally and in tests, in the dashboard's Postgres on a server. */
export interface AccountStore {
  account(id: string): Promise<Account | null>;
  accountByEmail(email: string): Promise<Account | null>;
  /** Oldest first. */
  accounts(): Promise<Account[]>;
  hasAdmin(): Promise<boolean>;
  /** False when the email already has an account. */
  createAccount(account: Account): Promise<boolean>;
  setRole(id: string, role: Role | null): Promise<Account | null>;
  setPassword(id: string, passwordHash: string, at: Date): Promise<void>;
  recordSignIn(id: string, at: Date): Promise<void>;

  createSession(session: SessionRecord): Promise<void>;
  /** The account behind a live session; null when the session is unknown or has expired. */
  sessionAccount(tokenHash: string, now: Date): Promise<Account | null>;
  deleteSession(tokenHash: string): Promise<void>;
  /** Ends someone's sessions: all of them, or all but `except`. */
  deleteSessionsOf(userId: string, except?: string): Promise<void>;

  /** Oldest first. */
  invitations(): Promise<Invitation[]>;
  invitation(id: string): Promise<Invitation | null>;
  invitationByEmail(email: string): Promise<Invitation | null>;
  invitationByToken(tokenHash: string): Promise<Invitation | null>;
  /** False when the email already has an invitation. */
  addInvitation(invitation: Invitation): Promise<boolean>;
  /** A resend: a new link and expiry for the same invitation. False when it no longer exists. */
  renewInvitation(id: string, renewal: { tokenHash: string; createdAt: Date; expiresAt: Date }): Promise<boolean>;
  deleteInvitation(id: string): Promise<boolean>;
  /** Creates the account and deletes the invitation together. False when the invitation is gone or the email already has an account. */
  acceptInvitation(id: string, account: Account): Promise<boolean>;

  createReset(reset: PasswordReset): Promise<void>;
  resetByToken(tokenHash: string): Promise<PasswordReset | null>;
  deleteResetsOf(userId: string): Promise<void>;

  /** One more within the window that started at the first hit (a new window once it has passed); returns the count. */
  hit(key: string, now: Date, windowMs: number): Promise<number>;
  /** The current window's count, 0 once it has passed. */
  hits(key: string, now: Date, windowMs: number): Promise<number>;
  clearHits(key: string): Promise<void>;

  /** Deletes expired sessions and resets, invitations that expired before `invitationsBefore`, and limit windows that started before `limitsBefore`. */
  forgetExpired(cutoffs: { now: Date; invitationsBefore: Date; limitsBefore: Date }): Promise<void>;
}

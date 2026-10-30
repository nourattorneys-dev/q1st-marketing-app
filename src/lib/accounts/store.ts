import type { Role } from "@/lib/auth/roles";

/** Someone who can sign in (spec M5c). The email is stored trimmed and lowercased, at most 254 characters. */
export type Account = {
  id: string;
  /** The client this person belongs to (P1b); null only for an account made before clients existed, until the app adopts it. */
  clientId: string | null;
  email: string;
  name: string;
  role: Role | null;
  passwordHash: string;
  createdAt: Date;
  passwordChangedAt: Date;
  lastSignInAt: Date | null;
};
/** `siteIds`: the sites a Reviewer will open (null = every site of the client). */
export type Invitation = {
  id: string;
  clientId: string | null;
  email: string;
  role: Role;
  siteIds: string[] | null;
  tokenHash: string;
  invitedBy: string | null;
  createdAt: Date;
  expiresAt: Date;
};
export type PasswordReset = { tokenHash: string; userId: string; createdAt: Date; expiresAt: Date };
export type SessionRecord = { tokenHash: string; userId: string; createdAt: Date; expiresAt: Date };

/** P1b: a client company, and one of its websites (the engine's site id; its engine key stays encrypted). */
export const CLIENT_STATUSES = ["active", "suspended", "closed"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export type Client = { id: string; name: string; engineAccountId: string | null; status: ClientStatus; createdAt: Date };
export type NewClient = Omit<Client, "engineAccountId" | "status"> & { engineAccountId?: string | null; status?: ClientStatus };
export type Site = { id: string; clientId: string; name: string; keyCipher: string; createdAt: Date };

/** The accounts behind this dashboard and their sign-in state: in memory locally and in tests, in the dashboard's Postgres on a server. */
export interface AccountStore {
  account(id: string): Promise<Account | null>;
  accountByEmail(email: string): Promise<Account | null>;
  /** A client's accounts, oldest first. */
  accounts(clientId: string): Promise<Account[]>;
  hasAdmin(clientId: string): Promise<boolean>;
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
  /** The site a browser is working on (P1b); null before one is chosen. */
  sessionSite(tokenHash: string): Promise<string | null>;
  setSessionSite(tokenHash: string, siteId: string): Promise<void>;

  /** A client's invitations, oldest first. */
  invitations(clientId: string): Promise<Invitation[]>;
  invitation(id: string): Promise<Invitation | null>;
  invitationByEmail(email: string): Promise<Invitation | null>;
  invitationByToken(tokenHash: string): Promise<Invitation | null>;
  /** False when the email already has an invitation. */
  addInvitation(invitation: Invitation): Promise<boolean>;
  /** A resend: a new link and expiry for the same invitation. False when it no longer exists. */
  renewInvitation(id: string, renewal: { tokenHash: string; createdAt: Date; expiresAt: Date }): Promise<boolean>;
  deleteInvitation(id: string): Promise<boolean>;
  /**
   * Creates the account (with the invitation's sites, if limited) and deletes the invitation together. False when the
   * invitation is gone or the email already has an account.
   */
  acceptInvitation(id: string, account: Account): Promise<boolean>;

  /** The sites a person may open when limited; empty = every site of their client. */
  userSites(userId: string): Promise<string[]>;
  setUserSites(userId: string, siteIds: string[]): Promise<void>;

  clients(): Promise<Client[]>;
  client(id: string): Promise<Client | null>;
  createClient(client: NewClient): Promise<void>;
  /** A client's sites (all sites when no client is given), oldest first. */
  sites(clientId?: string): Promise<Site[]>;
  site(id: string): Promise<Site | null>;
  createSite(site: Site): Promise<void>;
  /** P1c: the client that is this engine account, or null. */
  clientByEngineAccount(engineAccountId: string): Promise<Client | null>;
  updateClient(id: string, change: { name?: string; engineAccountId?: string; status?: ClientStatus }): Promise<void>;
  /** Deletes a client with its people (and their sessions and site access), invitations and sites; each site's webhook is the AppStore's. */
  deleteClient(id: string): Promise<void>;
  updateSite(id: string, change: { name?: string; keyCipher?: string }): Promise<void>;
  /**
   * Removes a site; sessions on it fall back to another site. Access rows naming it stay: a Reviewer limited to it then
   * opens nothing (no rows would mean every site). False when unknown.
   */
  deleteSite(id: string): Promise<boolean>;
  /** Accounts and invitations made before clients existed join this client. */
  adoptUnassigned(clientId: string): Promise<void>;

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

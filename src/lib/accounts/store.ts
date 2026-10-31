import type { Role } from "@/lib/auth/roles";

/**
 * Someone who can sign in (spec M5c), seen in one client: one email and password whichever clients they work for, and
 * the role they have in this one. The email is stored trimmed and lowercased, at most 254 characters.
 */
export type Account = {
  id: string;
  /** The client this view is of; null for the person alone (no client chosen, e.g. at sign-in). */
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
/** A person's place in a client; role null = No access there. */
export type Membership = { clientId: string; role: Role | null; createdAt: Date };

/** P1b: a client company, and one of its websites (the engine's site id; its engine key stays encrypted). */
export const CLIENT_STATUSES = ["active", "suspended", "closed"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export type Client = {
  id: string;
  name: string;
  engineAccountId: string | null;
  status: ClientStatus;
  brandColor: string | null;
  brandColorDark: string | null;
  logoAt: Date | null;
  /** Its own address: <slug>.<the app's domain>; null until one is given. */
  slug: string | null;
  createdAt: Date;
};
export type ClientLogo = { contentType: string; data: Buffer; updatedAt: Date };
export type NewClient = Omit<Client, "engineAccountId" | "status" | "brandColor" | "brandColorDark" | "logoAt" | "slug"> & {
  engineAccountId?: string | null;
  status?: ClientStatus;
  slug?: string | null;
};
export type Site = { id: string; clientId: string; name: string; keyCipher: string; createdAt: Date };

/** The accounts behind this dashboard and their sign-in state: in memory locally and in tests, in the dashboard's Postgres on a server. */
export interface AccountStore {
  /** The person alone (clientId and role null). */
  account(id: string): Promise<Account | null>;
  /** The person alone (clientId and role null). */
  accountByEmail(email: string): Promise<Account | null>;
  /** The person in this client, with their role there; null when they aren't one of its people. */
  member(userId: string, clientId: string): Promise<Account | null>;
  /** A client's people, oldest member first. */
  accounts(clientId: string): Promise<Account[]>;
  /** The clients a person works for, oldest first. */
  memberships(userId: string): Promise<Membership[]>;
  /** Adds an existing person to a client with a role (and, when limited, the sites they open). False when already one of its people. */
  addMember(userId: string, clientId: string, role: Role | null, siteIds: string[] | null, at: Date): Promise<boolean>;
  hasAdmin(clientId: string): Promise<boolean>;
  /** The person, with (when clientId is set) their place there with `role`; false when the email already has an account. */
  createAccount(account: Account): Promise<boolean>;
  setRole(userId: string, clientId: string, role: Role | null): Promise<Account | null>;
  setPassword(id: string, passwordHash: string, at: Date): Promise<void>;
  recordSignIn(id: string, at: Date): Promise<void>;

  createSession(session: SessionRecord): Promise<void>;
  /** The person behind a live session (clientId and role null); null when the session is unknown or has expired. */
  sessionAccount(tokenHash: string, now: Date): Promise<Account | null>;
  /** The client a browser last worked on, where the address names none. */
  sessionClient(tokenHash: string): Promise<string | null>;
  setSessionClient(tokenHash: string, clientId: string): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  /** Ends someone's sessions: all of them, or all but `except`. */
  deleteSessionsOf(userId: string, except?: string): Promise<void>;
  /** The site a browser is working on (P1b); null before one is chosen. */
  sessionSite(tokenHash: string): Promise<string | null>;
  setSessionSite(tokenHash: string, siteId: string): Promise<void>;

  /** A client's invitations, oldest first. */
  invitations(clientId: string): Promise<Invitation[]>;
  invitation(id: string): Promise<Invitation | null>;
  invitationByEmail(email: string, clientId: string | null): Promise<Invitation | null>;
  invitationByToken(tokenHash: string): Promise<Invitation | null>;
  /** False when the email already has an invitation from this client. */
  addInvitation(invitation: Invitation): Promise<boolean>;
  /** A resend: a new link and expiry for the same invitation. False when it no longer exists. */
  renewInvitation(id: string, renewal: { tokenHash: string; createdAt: Date; expiresAt: Date }): Promise<boolean>;
  deleteInvitation(id: string): Promise<boolean>;
  /**
   * Creates the person, their membership with the invited role (and the invitation's sites, if limited) and deletes the
   * invitation together. False when the invitation is gone or the email already has an account.
   */
  acceptInvitation(id: string, account: Account): Promise<boolean>;

  /** The sites a person may open in this client when limited; empty = every site of the client. */
  userSites(userId: string, clientId: string): Promise<string[]>;
  setUserSites(userId: string, clientId: string, siteIds: string[]): Promise<void>;

  clients(): Promise<Client[]>;
  client(id: string): Promise<Client | null>;
  createClient(client: NewClient): Promise<void>;
  /** A client's sites (all sites when no client is given), oldest first. */
  sites(clientId?: string): Promise<Site[]>;
  site(id: string): Promise<Site | null>;
  createSite(site: Site): Promise<void>;
  /** P1c: the client that is this engine account, or null. */
  clientByEngineAccount(engineAccountId: string): Promise<Client | null>;
  /** The client whose address this is. */
  clientBySlug(slug: string): Promise<Client | null>;
  /** False when another client already has this slug. */
  updateClient(
    id: string,
    change: { name?: string; engineAccountId?: string; status?: ClientStatus; brandColor?: string | null; brandColorDark?: string | null; slug?: string | null },
  ): Promise<boolean>;
  /** P2: the client's logo; null removes it. */
  setClientLogo(id: string, logo: ClientLogo | null): Promise<void>;
  clientLogo(id: string): Promise<ClientLogo | null>;
  /**
   * Deletes a client with its memberships, its people's access to its sites, its invitations and sites; a person who
   * then works for no client is deleted with their sessions and resets. Each site's webhook is the AppStore's.
   */
  deleteClient(id: string): Promise<void>;
  updateSite(id: string, change: { name?: string; keyCipher?: string }): Promise<void>;
  /**
   * Removes a site; sessions on it fall back to another site. Access rows naming it stay: a Reviewer limited to it then
   * opens nothing (no rows would mean every site). False when unknown.
   */
  deleteSite(id: string): Promise<boolean>;
  /** People who work for no client yet (made before clients existed) and invitations without a client join this client. */
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

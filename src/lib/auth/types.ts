import type { Role } from "./roles";

/** `twoFactor`: the person has two-factor login on (design §5: required for the Admin, recommended for Reviewers). */
/** `clientId`: the client the person belongs to (P1b); null for an account no client has adopted yet. */
export type Session = { userId: string; clientId: string | null; email: string; name: string; role: Role | null; twoFactor: boolean };
export type AuthedSession = Omit<Session, "role"> & { role: Role };

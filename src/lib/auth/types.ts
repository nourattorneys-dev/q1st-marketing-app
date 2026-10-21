import type { Role } from "./roles";

/** `twoFactor`: the person has two-factor login on (design §5: required for the Admin, recommended for Reviewers). */
export type Session = { userId: string; email: string; name: string; role: Role | null; twoFactor: boolean };
export type AuthedSession = Omit<Session, "role"> & { role: Role };

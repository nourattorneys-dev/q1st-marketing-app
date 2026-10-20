import type { Role } from "./roles";

export type Session = { userId: string; email: string; name: string; role: Role | null };
export type AuthedSession = Omit<Session, "role"> & { role: Role };

import { z } from "zod";
import { DirectoryError } from "./types";

/** An email as people mean it: trimmed and lower-case. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const Email = z.email().max(254);

/** The invitation's email, tidied; a DirectoryError with a field message when it isn't an email address. */
export function validInviteEmail(email: string): string {
  const tidy = normalizeEmail(email);
  if (!Email.safeParse(tidy).success) throw new DirectoryError("invalid_input", "Enter an email address.", { email: "Enter an email address." });
  return tidy;
}

/** Already someone's sign-in, or already invited (Review Focus 3). */
export function alreadyKnown(email: string, users: { email: string }[], invites: { email: string }[]): boolean {
  const wanted = normalizeEmail(email);
  return [...users, ...invites].some((entry) => normalizeEmail(entry.email) === wanted);
}

/** Nobody changes their own access, so an Admin can't remove or demote the last Admin: themselves (Review Focus 1). */
export const canChangeAccess = (actorId: string, targetId: string) => actorId !== targetId;

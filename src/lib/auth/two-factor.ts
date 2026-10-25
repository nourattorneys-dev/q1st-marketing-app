import type { Session } from "./types";

/** TWO_FACTOR: "required" (design §5: the Admin must, Reviewers are reminded) or "off" (Clerk's free plan has no two-factor login). */
export type TwoFactorPolicy = "required" | "off";
export type TwoFactorStatus = "on" | "required" | "recommended";

/** What the dashboard says about someone's two-factor login; null when it's switched off, so nothing asks for it. */
export function twoFactorStatus(policy: TwoFactorPolicy, session: Pick<Session, "role" | "twoFactor">): TwoFactorStatus | null {
  if (policy === "off") return null;
  if (session.twoFactor) return "on";
  return session.role === "admin" ? "required" : "recommended";
}

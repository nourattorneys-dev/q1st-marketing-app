"use client";

import { UserProfile } from "@clerk/nextjs";

/** Clerk's account page: two-factor login (authenticator app, backup codes), password and sessions. */
export function ClerkSecurity() {
  return <UserProfile routing="hash" />;
}

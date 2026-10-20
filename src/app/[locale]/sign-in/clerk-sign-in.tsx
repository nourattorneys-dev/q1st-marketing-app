"use client";

import { SignIn } from "@clerk/nextjs";

export function ClerkSignIn() {
  return <SignIn routing="hash" />;
}

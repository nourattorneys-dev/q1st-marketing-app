"use client";

import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/** Clerk sign-out, then a full page load of sign-in, so no hidden copy of the previous person's pages stays in the DOM. */
export function ClerkSignOut({ locale, label }: { locale: string; label: string }) {
  const { signOut } = useClerk();
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full page load is the point: in-app navigation keeps hidden copies
  const toSignIn = () => window.location.assign(`/${locale}/sign-in`);
  return (
    <Button variant="ghost" size="sm" data-testid="sign-out" onClick={() => void signOut(toSignIn)}>
      {label}
    </Button>
  );
}

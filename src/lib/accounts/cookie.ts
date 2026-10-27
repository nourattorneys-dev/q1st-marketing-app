const secure = (appUrl: string) => appUrl.startsWith("https:");

/**
 * Spec M5c: the session cookie. On HTTPS it's `__Host-session`: Secure, Path=/ and no Domain, so no other subdomain
 * can set or read it. On http://localhost (tests), where Secure isn't possible, it's plain `session`.
 */
export const sessionCookieName = (appUrl: string): string => (secure(appUrl) ? "__Host-session" : "session");

export function sessionCookieOptions(appUrl: string, expiresAt: Date) {
  return { httpOnly: true, secure: secure(appUrl), sameSite: "lax" as const, path: "/", expires: expiresAt };
}

/** What clears it: a browser drops a __Host- cookie only when the clearing one has the same Secure and Path=/. */
export function clearedSessionCookie(appUrl: string) {
  return { ...sessionCookieOptions(appUrl, new Date(0)), maxAge: 0 };
}

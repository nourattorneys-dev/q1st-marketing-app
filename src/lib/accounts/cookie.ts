type CookieEnv = { appUrl: string | null; clientDomain?: { domain: string } | null };

const secure = (env: CookieEnv) => Boolean(env.appUrl?.startsWith("https:"));
/** With each client at its own address, the one sign-in is shared by every name under the client domain. */
const shared = (env: CookieEnv) => (secure(env) && env.clientDomain ? env.clientDomain.domain : null);

/**
 * Spec M5c: the session cookie. On HTTPS it's `__Host-session`: Secure, Path=/ and no Domain, so no other subdomain
 * can set or read it. With CLIENT_DOMAIN it's `__Secure-session` for that domain, so one sign-in opens every client's
 * address there (each address still checks the person works for that client). On http://localhost (tests), where
 * Secure isn't possible, it's plain `session`.
 */
export const sessionCookieName = (env: CookieEnv): string => (shared(env) ? "__Secure-session" : secure(env) ? "__Host-session" : "session");

export function sessionCookieOptions(env: CookieEnv, expiresAt: Date) {
  const domain = shared(env);
  return { httpOnly: true, secure: secure(env), sameSite: "lax" as const, path: "/", expires: expiresAt, ...(domain ? { domain } : {}) };
}

/** What clears it: a browser drops it only when the clearing cookie has the same Secure, Path and Domain. */
export function clearedSessionCookie(env: CookieEnv) {
  return { ...sessionCookieOptions(env, new Date(0)), maxAge: 0 };
}

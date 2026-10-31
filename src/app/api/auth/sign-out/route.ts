import { NextResponse, type NextRequest } from "next/server";
import { asAppLocale } from "@/i18n/locales";
import { clearedSessionCookie, sessionCookieName } from "@/lib/accounts/cookie";
import { isOurOrigin } from "@/lib/tenancy/address";
import { endSession } from "@/lib/accounts/sign-in";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-session";
import { getAccountStore } from "@/lib/db";
import { serverEnv } from "@/lib/env";

/**
 * Sign-out as a plain form POST answered with a redirect: the browser loads the sign-in page itself, so no hidden copy
 * of the previous person's pages stays in the DOM (Next keeps recent pages hidden after in-app navigation). In password
 * mode it ends the session in the database, and refuses a form posted from another site (spec M5c).
 */
export async function POST(request: NextRequest) {
  const env = serverEnv();
  const form = await request.formData();
  const locale = asAppLocale(String(form.get("locale") ?? ""));
  if (env.authMode === "password" && env.appUrl) {
    const origin = request.headers.get("origin");
    if (!isOurOrigin(origin, env)) return new NextResponse(null, { status: 403 });
    const name = sessionCookieName(env);
    const token = request.cookies.get(name)?.value;
    if (token) await endSession(getAccountStore(), token);
    // Back to the sign-in page of the address it came from (one of ours, checked above).
    const response = NextResponse.redirect(new URL(`/${locale}/sign-in`, origin ?? env.appUrl), 303);
    response.cookies.set(name, "", clearedSessionCookie(env));
    return response;
  }
  const response = NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url), 303);
  response.cookies.delete(MOCK_SESSION_COOKIE);
  return response;
}

import { NextResponse, type NextRequest } from "next/server";
import { asAppLocale } from "@/i18n/locales";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-session";
import { serverEnv } from "@/lib/env";

/**
 * Test-login sign-out as a plain form POST answered with a redirect: the browser loads the sign-in page itself, so no
 * hidden copy of the previous person's pages stays in the DOM (Next keeps recent pages hidden after in-app navigation).
 */
export async function POST(request: NextRequest) {
  if (serverEnv().authMode !== "mock") return new NextResponse(null, { status: 404 });
  const form = await request.formData();
  const locale = asAppLocale(String(form.get("locale") ?? ""));
  const response = NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url), 303);
  response.cookies.delete(MOCK_SESSION_COOKIE);
  return response;
}

import { clerkMiddleware } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlProxy = createMiddleware(routing);

// API routes have no locale: they pass straight through. They still go through the proxy, because Clerk's
// auth() only works in routes the middleware ran for.
export function handle(request: NextRequest) {
  return request.nextUrl.pathname.startsWith("/api/") ? NextResponse.next() : intlProxy(request);
}

// Clerk's middleware needs keys, so it only runs in Clerk mode. Page guards and routes do the access checks in both modes.
export default process.env.AUTH_MODE === "clerk" ? clerkMiddleware((_auth, request) => handle(request)) : handle;

export const config = { matcher: ["/((?!api|_next|_vercel|.*\\..*).*)", "/api/(.*)"] };

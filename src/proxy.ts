import { clerkMiddleware } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlProxy = createMiddleware(routing);

// Clerk's middleware needs keys, so it only runs in Clerk mode. Page guards do the access checks in both modes.
export default process.env.AUTH_MODE === "clerk"
  ? clerkMiddleware((_auth, request) => intlProxy(request))
  : (request: NextRequest) => intlProxy(request);

export const config = { matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"] };

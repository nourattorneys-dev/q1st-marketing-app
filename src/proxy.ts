import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/**
 * Languages only (spec M5c): pages and routes check access themselves, and API routes don't come through here. The
 * page's path goes along as x-request-path, so a page opened at APP_URL can move to its client's own address unchanged.
 */
export default function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-request-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return intl(new NextRequest(request, { headers }));
}

export const config = { matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"] };

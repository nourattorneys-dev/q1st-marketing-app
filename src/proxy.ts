import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/** Languages only (spec M5c): pages and routes check access themselves, and API routes don't come through here. */
export default createMiddleware(routing);

export const config = { matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"] };

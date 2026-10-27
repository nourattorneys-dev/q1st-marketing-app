import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // scripts/cpanel-build.sh: a self-contained server for the cPanel host. Vercel and local runs don't need it.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  // Browsers that reached the dashboard over HTTPS keep to it for a year: the sign-in form posts passwords here.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] }];
  },
  experimental: {
    // Photo uploads go through a server action: /meta.limits.photoMaxBytes is 5 MB, plus multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("always HTTPS (M5c final review: the sign-in form posts passwords to this site)", () => {
  it("tells browsers to use HTTPS for a year on every page (HSTS)", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules).toContainEqual({ source: "/:path*", headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] });
  });

  it("redirects plain HTTP to HTTPS on the cPanel host, except AutoSSL's /.well-known/ checks, live and preview", () => {
    for (const file of ["deploy/cpanel/htaccess", "deploy/cpanel/htaccess-preview"]) {
      const text = readFileSync(file, "utf8");
      expect(text, file).toContain("RewriteCond %{REQUEST_URI} !^/\\.well-known/");
      expect(text, file).toContain("RewriteCond %{HTTPS} off");
      expect(text, file).toContain("RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]");
    }
  });
});

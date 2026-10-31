import { describe, expect, it } from "vitest";
import { clientNameOfHost, clientNameProblem, clientOrigin, isOurOrigin } from "@/lib/tenancy/address";
import { parseServerEnv } from "@/lib/env";

const env = parseServerEnv({ AUTH_MODE: "password", APP_URL: "https://app.q1st.io", CLIENT_DOMAIN: "q1st.io" });
const single = parseServerEnv({ AUTH_MODE: "password", APP_URL: "https://app.q1st.io" });

describe("each client at its own address", () => {
  it("reads the client name from the host", () => {
    expect(clientNameOfHost("fakher.q1st.io", env)).toBe("fakher");
    expect(clientNameOfHost("Fakher.Q1st.io:443", env)).toBe("fakher");
  });
  it("APP_URL's own name, a reserved name, a deeper name or another domain is no client", () => {
    expect(clientNameOfHost("app.q1st.io", env)).toBeNull();
    expect(clientNameOfHost("www.q1st.io", env)).toBeNull();
    expect(clientNameOfHost("a.b.q1st.io", env)).toBeNull();
    expect(clientNameOfHost("fakher.example.com", env)).toBeNull();
    expect(clientNameOfHost("q1st.io", env)).toBeNull();
  });
  it("without CLIENT_DOMAIN every client works at APP_URL", () => {
    expect(clientNameOfHost("fakher.q1st.io", single)).toBeNull();
    expect(clientOrigin({ slug: "fakher" }, single)).toBe("https://app.q1st.io");
  });
  it("a client's address, or APP_URL while it has no name", () => {
    expect(clientOrigin({ slug: "fakher" }, env)).toBe("https://fakher.q1st.io");
    expect(clientOrigin({ slug: null }, env)).toBe("https://app.q1st.io");
  });
  it("checks a name: one DNS label, not reserved", () => {
    expect(clientNameProblem("fakher-co", env)).toBeNull();
    expect(clientNameProblem("Fakher", env)).toBe("format");
    expect(clientNameProblem("-x", env)).toBe("format");
    expect(clientNameProblem("a.b", env)).toBe("format");
    expect(clientNameProblem("app", env)).toBe("reserved");
    expect(clientNameProblem("staff", env)).toBe("reserved");
  });
  it("accepts posts only from our own addresses", () => {
    expect(isOurOrigin("https://app.q1st.io", env)).toBe(true);
    expect(isOurOrigin("https://fakher.q1st.io", env)).toBe(true);
    expect(isOurOrigin("http://fakher.q1st.io", env)).toBe(false);
    expect(isOurOrigin("https://evil.example.com", env)).toBe(false);
    expect(isOurOrigin("https://fakher.q1st.io", single)).toBe(false);
  });
  it("CLIENT_DOMAIN must hold APP_URL as one name under it", () => {
    expect(() => parseServerEnv({ AUTH_MODE: "password", APP_URL: "https://app.q1st.io", CLIENT_DOMAIN: "example.com" })).toThrow(/CLIENT_DOMAIN/);
  });
});

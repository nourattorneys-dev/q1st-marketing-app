import { describe, expect, it } from "vitest";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "@/lib/accounts/passwords";
import { clientAddress } from "@/lib/accounts/request";
import { hashToken, newId, newToken } from "@/lib/accounts/tokens";

describe("passwords (spec M5c: scrypt from node:crypto)", () => {
  it("stores a salted scrypt hash that names its settings, and checks it", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored).toMatch(/^scrypt\$15\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
    expect(await hashPassword("correct horse battery")).not.toBe(stored);
  });

  it("accepts the same password however its characters are composed (Review Focus 4)", async () => {
    const composed = "مرحبا café 2026!";
    const decomposed = "مرحبا café 2026!";
    expect(decomposed).not.toBe(composed);
    expect(await verifyPassword(decomposed, await hashPassword(composed))).toBe(true);
  });

  it("refuses anything that isn't one of its hashes", async () => {
    for (const stored of ["", "plain-text", "bcrypt$10$abc", "scrypt$15$8$1$", "scrypt$99$8$1$AAAA$BBBB"]) {
      expect(await verifyPassword("anything", stored)).toBe(false);
    }
  });

  it("has a dummy hash that no password matches, for unknown emails", async () => {
    expect(await dummyHash()).toBe(await dummyHash());
    expect(await verifyPassword("", await dummyHash())).toBe(false);
  });

  it("asks for 10 to 200 characters, counted as characters, never trimmed, and not the email", () => {
    expect(passwordProblem("123456789", "a@example.com")).toBe("short");
    expect(passwordProblem("1234567890", "a@example.com")).toBeNull();
    expect(passwordProblem(" 12345678 ", "a@example.com")).toBeNull();
    expect(passwordProblem("🙂".repeat(10), "a@example.com")).toBeNull();
    expect(passwordProblem("x".repeat(200), "a@example.com")).toBeNull();
    expect(passwordProblem("x".repeat(201), "a@example.com")).toBe("long");
    expect(passwordProblem(" Sara.Ali@Example.com ", "sara.ali@example.com")).toBe("email");
  });
});

describe("tokens", () => {
  it("makes 256-bit URL-safe tokens and stores only their sha256", () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });

  it("makes ids the Users page accepts", () => {
    expect(newId("usr")).toMatch(/^usr_[A-Za-z0-9_-]{22}$/);
    expect(newId("inv")).toMatch(/^inv_[A-Za-z0-9_-]{22}$/);
  });
});

describe("the visitor's address (Passenger appends the real one last)", () => {
  it("takes the last X-Forwarded-For entry, so a forged first entry is ignored", () => {
    expect(clientAddress("203.0.113.5")).toBe("203.0.113.5");
    expect(clientAddress("198.51.100.1, 203.0.113.5")).toBe("203.0.113.5");
    expect(clientAddress("2001:db8::1")).toBe("2001:db8::1");
    expect(clientAddress("::ffff:203.0.113.5")).toBe("203.0.113.5");
  });

  it("has no address for this machine, junk or nothing, so the per-address limit can't lock everyone at once", () => {
    for (const value of [null, "", "127.0.0.1", "198.51.100.1, 127.0.0.1", "::1", "not-an-address", "203.0.113.5:443"]) {
      expect(clientAddress(value)).toBeNull();
    }
  });
});

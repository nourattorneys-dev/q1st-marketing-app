import { describe, expect, it, vi } from "vitest";
import { notificationFor, WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { decryptSecret, encryptSecret, secretKeyFor } from "@/lib/webhooks/secret";
import { signBody, verifySignature } from "@/lib/webhooks/signature";

const KEY = Buffer.alloc(32, 1);
const NOW = new Date("2026-10-22T08:00:00Z");
const envelope = (event: string, data: unknown) => ({ event, siteId: "site_12", at: "2026-10-22T12:00:00+04:00", data });

describe("the webhook secret at rest (design §11)", () => {
  it("encrypts so the stored text never contains the secret, and decrypts with the same key", () => {
    const stored = encryptSecret("whsec_abc123", KEY);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain("whsec_abc123");
    expect(encryptSecret("whsec_abc123", KEY)).not.toBe(stored); // a fresh IV each time
    expect(decryptSecret(stored, KEY)).toBe("whsec_abc123");
  });

  it("gives nothing back for another key or altered text (Review Focus 3)", () => {
    const stored = encryptSecret("whsec_abc123", KEY);
    expect(decryptSecret(stored, Buffer.alloc(32, 2))).toBeNull();
    expect(decryptSecret(`${stored.slice(0, -4)}${stored.endsWith("AAAA") ? "BBBB" : "AAAA"}`, KEY)).toBeNull();
    expect(decryptSecret("plain", KEY)).toBeNull();
  });

  it("uses WEBHOOK_ENCRYPTION_KEY, or one key per process with the in-memory store, and none for Postgres without it", () => {
    expect(secretKeyFor({ dbMode: "postgres", encryptionKey: KEY })).toBe(KEY);
    expect(secretKeyFor({ dbMode: "postgres", encryptionKey: null })).toBeNull();
    const memory = secretKeyFor({ dbMode: "memory", encryptionKey: null });
    expect(memory?.length).toBe(32);
    expect(secretKeyFor({ dbMode: "memory", encryptionKey: null })).toBe(memory);
  });
});

describe("signatures (spec v1.1 §8: X-Signature: sha256=<HMAC of raw body>)", () => {
  const body = JSON.stringify(envelope("post.drafted", { postId: "p_1", status: "pending" }));

  it("accepts the hex HMAC of the raw body, in any letter case", () => {
    const header = signBody(body, "whsec_abc123");
    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature(body, header, "whsec_abc123")).toBe(true);
    expect(verifySignature(body, `sha256=${header.slice(7).toUpperCase()}`, "whsec_abc123")).toBe(true);
  });

  it("rejects a wrong secret, a changed body, and a missing or malformed header (Review Focus 1)", () => {
    const header = signBody(body, "whsec_abc123");
    expect(verifySignature(body, header, "whsec_other")).toBe(false);
    expect(verifySignature(`${body} `, header, "whsec_abc123")).toBe(false);
    expect(verifySignature(body, null, "whsec_abc123")).toBe(false);
    expect(verifySignature(body, "sha256=abc", "whsec_abc123")).toBe(false);
  });
});

describe("which events email whom (design §10)", () => {
  it("subscribes to every event spec v1.1 §8 lists", () => {
    expect(WEBHOOK_EVENTS).toHaveLength(12);
    expect(WEBHOOK_EVENTS).toContain("connection.changed");
  });

  it("tells Reviewers about drafts, and the Admin about failures, broken connections, quotas and finished scans", () => {
    expect(notificationFor("evt_1", envelope("post.drafted", { postId: "p_1", status: "pending" }), NOW)).toEqual({
      eventId: "evt_1",
      kind: "drafted",
      audience: "reviewers",
      data: { postId: "p_1" },
      createdAt: NOW,
    });
    expect(notificationFor("evt_2", envelope("post.failed", { postId: "p_2", error: { code: "publish_failed", message: "WordPress refused" } }), NOW)).toMatchObject({
      kind: "failed",
      audience: "admins",
      data: { postId: "p_2", error: "WordPress refused" },
    });
    expect(notificationFor("evt_3", envelope("connection.changed", { type: "linkedin", status: "expiring" }), NOW)).toMatchObject({
      kind: "connection",
      audience: "admins",
      data: { type: "linkedin", status: "expiring" },
    });
    expect(notificationFor("evt_4", envelope("quota.warning", { metric: "articles", used: 36, limit: 40 }), NOW)).toMatchObject({ kind: "quotaWarning", audience: "admins" });
    expect(notificationFor("evt_5", envelope("quota.exceeded", { metric: "articles", used: 40, limit: 40, mode: "hard" }), NOW)).toMatchObject({ kind: "quotaExceeded" });
    expect(notificationFor("evt_6", envelope("site.scan_finished", { findings: 7 }), NOW)).toMatchObject({ kind: "scan", data: { findings: 7 } });
  });

  it("sends nothing for a connection that works again, for events with no email, or for data in an unknown shape", () => {
    expect(notificationFor("evt_7", envelope("connection.changed", { type: "website", status: "ok" }), NOW)).toBeNull();
    expect(notificationFor("evt_8", envelope("post.published", { postId: "p_1", url: "https://x.example", platform: "blog" }), NOW)).toBeNull();
    expect(notificationFor("evt_9", envelope("something.new", {}), NOW)).toBeNull();
    expect(notificationFor("evt_10", envelope("post.drafted", { id: 5 }), NOW)).toBeNull();
  });

  it("tells the Admin about a failed post whatever shape its error has (final review)", () => {
    const long = "x".repeat(800);
    for (const error of [long, { code: "publish_failed" }, { message: `<html>${long}</html>` }, null, undefined, 42]) {
      const notification = notificationFor("evt_f", envelope("post.failed", { postId: "p_9", error }), NOW);
      expect(notification).toMatchObject({ kind: "failed", audience: "admins", data: { postId: "p_9" } });
      expect(String(notification?.data.error ?? "").length).toBeLessThanOrEqual(500);
    }
  });

  it("says so in the server log when an email-worthy delivery is dropped for its data's shape (final review)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(notificationFor("evt_11", envelope("post.drafted", { id: 5 }), NOW)).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("post.drafted"));
    warn.mockClear();
    expect(notificationFor("evt_12", envelope("connection.changed", { type: "website", status: "ok" }), NOW)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});


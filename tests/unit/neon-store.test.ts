import { drizzle } from "drizzle-orm/neon-http";
import { describe, expect, it } from "vitest";
import { queries } from "@/lib/db/neon-store";
import * as schema from "@/lib/db/schema";

// No database runs locally: these read the SQL the Neon store sends. The go-live check runs it against Neon (README).
const db = drizzle.mock({ schema });
const AT = new Date("2026-10-22T08:00:00Z");

describe("the Neon store's SQL (DB_MODE=neon)", () => {
  it("records a delivery and its notification without overwriting either (a retried delivery)", () => {
    const notification = queries
      .insertNotification(db, { eventId: "evt_1", kind: "drafted", audience: "reviewers", data: { postId: "p_1" }, createdAt: AT })
      .toSQL();
    expect(notification.sql).toMatch(/^insert into "notifications"/);
    expect(notification.sql).toMatch(/on conflict do nothing$/);
    expect(notification.params).toContain("evt_1");
    const event = queries.insertEvent(db, { id: "evt_1", event: "post.drafted", receivedAt: AT }).toSQL();
    expect(event.sql).toMatch(/^insert into "webhook_events"/);
    expect(event.sql).toMatch(/on conflict do nothing$/);
  });

  it("reads pending notifications oldest first, and marks only unsent ones sent", () => {
    const pending = queries.pending(db).toSQL().sql;
    expect(pending).toMatch(/"sent_at" is null/);
    expect(pending).toMatch(/order by "notifications"\."created_at"/);
    const marked = queries.markSent(db, ["evt_1", "evt_2"], ["r@example.com"], AT).toSQL().sql;
    expect(marked).toMatch(/^update "notifications" set "sent_at" = \$\d+, "recipients" = \$\d+/);
    expect(marked).toMatch(/"event_id" in \(\$\d+, \$\d+\)/);
    expect(marked).toMatch(/"sent_at" is null/);
  });

  it("keeps one webhook row and one preference row per person, updating them in place", () => {
    expect(queries.saveWebhook(db, { url: "https://p.example/api/hooks/marketing", secretCipher: "v1:x", updatedAt: AT }).toSQL().sql).toMatch(
      /on conflict \("id"\) do update set/,
    );
    expect(queries.setEmailOff(db, "user_1", true, AT).toSQL().sql).toMatch(/on conflict \("user_id"\) do update set/);
  });

  it("forgets deliveries and sent notifications older than the cutoff, never unsent ones", () => {
    expect(queries.forgetEvents(db, AT).toSQL().sql).toMatch(/^delete from "webhook_events" where "webhook_events"\."received_at" < \$1/);
    const sent = queries.forgetSent(db, AT).toSQL().sql;
    expect(sent).toMatch(/"sent_at" is not null/);
    expect(sent).toMatch(/"sent_at" < \$\d+/);
  });

  it("records deliveries per person without duplicates, reads them by event, and forgets old ones (final review)", () => {
    const record = queries.recordDelivery(db, ["evt_1", "evt_2"], "a@example.com", AT).toSQL();
    expect(record.sql).toMatch(/^insert into "notification_deliveries"/);
    expect(record.sql).toMatch(/on conflict do nothing$/);
    expect(queries.deliveries(db, ["evt_1", "evt_2"]).toSQL().sql).toMatch(/"event_id" in \(\$\d+, \$\d+\)/);
    expect(queries.forgetDeliveries(db, AT).toSQL().sql).toMatch(/^delete from "notification_deliveries" where "notification_deliveries"\."sent_at" < \$1/);
  });
});

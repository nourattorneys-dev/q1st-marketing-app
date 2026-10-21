import { z } from "zod";
import type { Audience, StoredNotification } from "@/lib/db/store";

/** Spec v1.1 §8: every event the dashboard subscribes to. */
export const WEBHOOK_EVENTS = [
  "job.finished",
  "post.drafted",
  "post.published",
  "post.failed",
  "suggestions.created",
  "keywords.proposed",
  "connection.changed",
  "performance.refresh_suggested",
  "site.scan_finished",
  "quota.warning",
  "quota.exceeded",
  "plan.changed",
] as const;

/** X-Event-Id ("evt_…"): a safe set of characters, because it becomes a database key. */
export const EVENT_ID = /^[A-Za-z0-9_.:-]{1,128}$/;

/** Spec v1.1 §8 body: { event, siteId, at, data }. */
export const EnvelopeSchema = z.object({ event: z.string().min(1).max(100), siteId: z.string(), at: z.string(), data: z.unknown() });
export type Envelope = z.infer<typeof EnvelopeSchema>;

export const NOTIFICATION_KINDS = ["drafted", "failed", "connection", "quotaWarning", "quotaExceeded", "scan"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const Text = z.string().max(500);
const PostId = z.object({ postId: Text });
const Failed = z.object({ postId: Text, error: z.unknown().optional() });
const Connection = z.object({ type: Text, status: Text });
const Quota = z.object({ metric: Text, used: z.number(), limit: z.number() });
const Scan = z.object({ findings: z.number().int().nonnegative() });

/** Best effort: a readable line from whatever `error` the engine sent (a string, or an object with a message), at most 500 characters. */
function errorText(value: unknown): string | null {
  const message = typeof value === "object" && value !== null ? (value as { message?: unknown }).message : value;
  return typeof message === "string" ? message.slice(0, 500) : null;
}

/** An email-worthy delivery whose data the dashboard can't read: acknowledged, but said in the server log (final review). */
function dropped(event: string): null {
  console.warn(`Webhook ${event}: its data isn't in the expected shape, so no email was queued.`);
  return null;
}

/**
 * Design §10: which deliveries email whom. Drafts go to Reviewers; failed posts, connections that aren't "ok", quota
 * warnings and finished scans go to the Admin. Other events need no email: every screen reads the engine when it opens.
 * Data in a shape the dashboard doesn't know sends nothing. Null: no email.
 */
export function notificationFor(eventId: string, envelope: Envelope, now: Date): StoredNotification | null {
  const make = (kind: NotificationKind, audience: Audience, data: Record<string, unknown>): StoredNotification => ({ eventId, kind, audience, data, createdAt: now });
  switch (envelope.event) {
    case "post.drafted": {
      const parsed = PostId.safeParse(envelope.data);
      return parsed.success ? make("drafted", "reviewers", { postId: parsed.data.postId }) : dropped(envelope.event);
    }
    case "post.failed": {
      const parsed = Failed.safeParse(envelope.data);
      return parsed.success ? make("failed", "admins", { postId: parsed.data.postId, error: errorText(parsed.data.error) }) : dropped(envelope.event);
    }
    case "connection.changed": {
      const parsed = Connection.safeParse(envelope.data);
      if (!parsed.success) return dropped(envelope.event);
      return parsed.data.status !== "ok" ? make("connection", "admins", { type: parsed.data.type, status: parsed.data.status }) : null;
    }
    case "quota.warning":
    case "quota.exceeded": {
      const parsed = Quota.safeParse(envelope.data);
      if (!parsed.success) return dropped(envelope.event);
      return make(envelope.event === "quota.warning" ? "quotaWarning" : "quotaExceeded", "admins", {
        metric: parsed.data.metric,
        used: parsed.data.used,
        limit: parsed.data.limit,
      });
    }
    case "site.scan_finished": {
      const parsed = Scan.safeParse(envelope.data);
      return parsed.success ? make("scan", "admins", { findings: parsed.data.findings }) : dropped(envelope.event);
    }
    default:
      return null;
  }
}

import { createHash } from "node:crypto";
import type { AppStore } from "@/lib/db/store";
import type { DirectoryUser } from "@/lib/users/types";
import { dueBatches } from "./batches";
import type { Mailer } from "./mailer";
import { recipientsFor } from "./recipients";
import { renderBatch } from "./render";

/** Design §4: handled event ids (and sent notifications) are kept 30 days. */
export const KEEP_DAYS = 30;

/** A batch stops waiting for people its email can't reach after a day (Resend keeps idempotency keys for 24 hours). */
export const GIVE_UP_MS = 24 * 3_600_000;

type FlushOptions = { store: AppStore; mailer: Mailer; users: () => Promise<DirectoryUser[]>; origin: string | null; now: Date; quietMs: number };

/**
 * Sends what's due (design §10): one email per person per batch, holding only the items that person hasn't had yet, so
 * a retry (after a failed send, even with new items since) never emails anyone twice. The idempotency key is those items
 * and the address, hashed. A batch is marked sent once everyone has it, or after a day of failing for someone (logged).
 */
export async function flushNotifications({ store, mailer, users, origin, now, quietMs }: FlushOptions): Promise<{ batches: number; emails: number; failed: number }> {
  await store.forgetBefore(new Date(now.getTime() - KEEP_DAYS * 86_400_000));
  const batches = dueBatches(await store.pendingNotifications(), now, quietMs);
  if (batches.length === 0) return { batches: 0, emails: 0, failed: 0 };

  const [people, emailOff] = await Promise.all([users(), store.emailOffUsers()]);
  let emails = 0;
  let failed = 0;
  for (const batch of batches) {
    const eventIds = batch.items.map((item) => item.eventId);
    const recipients = recipientsFor(batch.audience, people, emailOff);
    const delivered = await store.deliveries(eventIds);
    const reached: string[] = [];
    for (const recipient of recipients) {
      const items = batch.items.filter((item) => !delivered.get(item.eventId)?.has(recipient.email));
      if (items.length > 0) {
        const itemIds = items.map((item) => item.eventId);
        const key = createHash("sha256").update(`${[...itemIds].sort().join(",")}|${recipient.email}`).digest("hex");
        try {
          await mailer.send({ ...renderBatch({ audience: batch.audience, items }, origin), to: recipient.email, idempotencyKey: key });
        } catch {
          failed += 1;
          continue;
        }
        await store.recordDelivery(itemIds, recipient.email, now);
        emails += 1;
      }
      reached.push(recipient.email);
    }
    const oldest = Math.min(...batch.items.map((item) => item.createdAt.getTime()));
    if (reached.length === recipients.length) {
      await store.markSent(eventIds, reached, now);
    } else if (now.getTime() - oldest >= GIVE_UP_MS) {
      console.warn(`Notification emails: gave up after a day on ${recipients.length - reached.length} of ${recipients.length} people (${batch.audience}).`);
      await store.markSent(eventIds, reached, now);
    }
  }
  return { batches: batches.length, emails, failed };
}

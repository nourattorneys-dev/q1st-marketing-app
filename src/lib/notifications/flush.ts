import { createHash } from "node:crypto";
import type { AppStore } from "@/lib/db/store";
import type { DirectoryUser } from "@/lib/users/types";
import { dueBatches } from "./batches";
import type { Mailer } from "./mailer";
import { recipientsFor } from "./recipients";
import { renderBatch } from "./render";

/** Design §4: handled event ids (and sent notifications) are kept 30 days. */
export const KEEP_DAYS = 30;

type FlushOptions = { store: AppStore; mailer: Mailer; users: () => Promise<DirectoryUser[]>; origin: string | null; now: Date; quietMs: number };

/**
 * Sends what's due (design §10): one email per person per batch. A batch is marked sent only once every one of its
 * emails went out. Otherwise it stays pending for the next run, and each email's idempotency key (the batch plus the
 * address) keeps anyone who already got it from getting it again.
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
    const email = renderBatch(batch, origin);
    const batchKey = createHash("sha256").update([...eventIds].sort().join(",")).digest("hex");
    const results = await Promise.allSettled(recipients.map((recipient) => mailer.send({ ...email, to: recipient.email, idempotencyKey: `${batchKey}:${recipient.email}` })));
    const sent = results.filter((result) => result.status === "fulfilled").length;
    emails += sent;
    failed += results.length - sent;
    if (sent === results.length) await store.markSent(eventIds, recipients.map((recipient) => recipient.email), now);
  }
  return { batches: batches.length, emails, failed };
}

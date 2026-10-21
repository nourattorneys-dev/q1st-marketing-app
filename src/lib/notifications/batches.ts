import type { Audience, StoredNotification } from "@/lib/db/store";

export type Batch = { audience: Audience; items: StoredNotification[] };

/**
 * Design §10 "grouped per batch": an audience's pending notifications go out together, once nothing new has arrived
 * for `quietMs`. Drafts from one drafting run make one email, not one each.
 */
export function dueBatches(pending: StoredNotification[], now: Date, quietMs: number): Batch[] {
  const byAudience = new Map<Audience, StoredNotification[]>();
  for (const item of pending) byAudience.set(item.audience, [...(byAudience.get(item.audience) ?? []), item]);
  return [...byAudience].flatMap(([audience, items]) => {
    const newest = Math.max(...items.map((item) => item.createdAt.getTime()));
    return now.getTime() - newest >= quietMs ? [{ audience, items }] : [];
  });
}

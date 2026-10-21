/** Fakher & Co's mock publishing settings: 2 a day, Sunday to Thursday, at 10:00 and 13:00 Dubai time (UTC+4, no DST). */
const DUBAI_OFFSET_MS = 4 * 3_600_000;
const FIRST_DAY = Date.UTC(2026, 9, 22); // Thursday 22 Oct 2026, as a Dubai calendar date at UTC midnight
const SLOT_HOURS = [10, 13];
const PUBLISHING_DAYS = new Set([0, 1, 2, 3, 4]); // Sunday … Thursday

export function toDubaiIso(ms: number): string {
  return `${new Date(ms + DUBAI_OFFSET_MS).toISOString().slice(0, 19)}+04:00`;
}

/** The first `count` publishing slots of the mock queue, as ISO times with Dubai's offset. */
export function slotTimes(count: number): string[] {
  const slots: string[] = [];
  for (let day = 0; slots.length < count; day++) {
    const date = FIRST_DAY + day * 86_400_000;
    if (!PUBLISHING_DAYS.has(new Date(date).getUTCDay())) continue;
    for (const hour of SLOT_HOURS) {
      if (slots.length < count) slots.push(toDubaiIso(date + hour * 3_600_000 - DUBAI_OFFSET_MS));
    }
  }
  return slots;
}

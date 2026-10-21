/** The mock's publishing slots, from the publishing settings (Dubai is UTC+4 with no DST). */
const DUBAI_OFFSET_MS = 4 * 3_600_000;
const FIRST_DAY = Date.UTC(2026, 9, 22); // Thursday 22 Oct 2026, as a Dubai calendar date at UTC midnight

/** Weekday codes in `Date.getUTCDay()` order (spec v1.1 §4 PublishingSettings.days). */
export const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type SlotPlan = { days: string[]; from: string; to: string; perDay: number; gapMinutes: number };

/** Fakher & Co: 2 a day, Sunday to Thursday, from 10:00, 3 hours apart, so 10:00 and 13:00. */
const FAKHER_PLAN: SlotPlan = { days: ["sun", "mon", "tue", "wed", "thu"], from: "10:00", to: "17:00", perDay: 2, gapMinutes: 180 };

export function toDubaiIso(ms: number): string {
  return `${new Date(ms + DUBAI_OFFSET_MS).toISOString().slice(0, 19)}+04:00`;
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** A day's slot times, in minutes after midnight: from `from`, `gapMinutes` apart, at most `perDay`, none after `to`. */
function dayMinutes(plan: SlotPlan): number[] {
  const start = minutesOf(plan.from);
  const end = minutesOf(plan.to);
  const times: number[] = [];
  for (let i = 0; i < plan.perDay; i++) {
    const minute = start + i * plan.gapMinutes;
    if (minute > end) break;
    times.push(minute);
  }
  return times;
}

/** The first `count` publishing slots of the mock queue, as ISO times with Dubai's offset. */
export function slotTimes(count: number, plan: SlotPlan = FAKHER_PLAN): string[] {
  const minutes = dayMinutes(plan);
  const days = new Set(plan.days.map((day) => (DAY_CODES as readonly string[]).indexOf(day)).filter((index) => index >= 0));
  const slots: string[] = [];
  if (minutes.length === 0 || days.size === 0) return slots;
  for (let day = 0; slots.length < count; day++) {
    const date = FIRST_DAY + day * 86_400_000;
    if (!days.has(new Date(date).getUTCDay())) continue;
    for (const minute of minutes) {
      if (slots.length < count) slots.push(toDubaiIso(date + minute * 60_000 - DUBAI_OFFSET_MS));
    }
  }
  return slots;
}

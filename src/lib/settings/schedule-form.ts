import type { PublishingSettings } from "@/lib/engine/schemas";

/** Weekday codes (spec v1.1 §4 PublishingSettings.days), Sunday first as the spec's example lists them. */
export const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** The form keeps numbers as typed text until saving, so a half-typed number isn't rewritten under the cursor. */
export type ScheduleForm = { autoPublish: boolean; perDay: string; days: string[]; from: string; to: string; gapMinutes: string };

const isWeekday = (day: string) => (WEEK as readonly string[]).includes(day);

/** Days in week order; a code this form doesn't know is kept at the end and sent back unchanged. */
export function orderedDays(days: string[]): string[] {
  return [...WEEK.filter((day) => days.includes(day)), ...days.filter((day) => !isWeekday(day))];
}

export function toScheduleForm(settings: PublishingSettings): ScheduleForm {
  return {
    autoPublish: settings.autoPublish,
    perDay: String(settings.perDay),
    days: orderedDays(settings.days),
    from: settings.from,
    to: settings.to,
    gapMinutes: String(settings.gapMinutes),
  };
}

export function withDay(form: ScheduleForm, day: string, on: boolean): ScheduleForm {
  const days = on ? [...form.days, day] : form.days.filter((item) => item !== day);
  return { ...form, days: orderedDays([...new Set(days)]) };
}

const WHOLE = /^\s*\d+\s*$/;

/** The PUT body, or the number fields that aren't whole numbers (caught here, before any request). */
export function toPublishingUpdate(
  form: ScheduleForm,
  version: number,
): { ok: true; update: PublishingSettings } | { ok: false; invalid: ("perDay" | "gapMinutes")[] } {
  const invalid = (["perDay", "gapMinutes"] as const).filter((key) => !WHOLE.test(form[key]));
  if (invalid.length > 0) return { ok: false, invalid };
  return {
    ok: true,
    update: {
      autoPublish: form.autoPublish,
      perDay: Number.parseInt(form.perDay, 10),
      days: form.days,
      from: form.from,
      to: form.to,
      gapMinutes: Number.parseInt(form.gapMinutes, 10),
      version,
    },
  };
}

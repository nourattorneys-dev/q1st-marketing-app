import { describe, expect, it } from "vitest";
import { toPublishingUpdate, toScheduleForm, withDay } from "@/lib/settings/schedule-form";

const SETTINGS = { autoPublish: true, perDay: 2, days: ["sun", "mon", "tue", "wed", "thu"], from: "10:00", to: "17:00", gapMinutes: 180, version: 4 };

describe("the schedule form (spec v1.1 §4 PublishingSettings)", () => {
  it("turns the settings into a form and back", () => {
    expect(toPublishingUpdate(toScheduleForm(SETTINGS), 4)).toEqual({ ok: true, update: SETTINGS });
  });

  it("keeps days in week order, and keeps a code it doesn't know", () => {
    const form = toScheduleForm({ ...SETTINGS, days: ["thu", "sun", "holiday"] });
    expect(form.days).toEqual(["sun", "thu", "holiday"]);
    expect(withDay(form, "mon", true).days).toEqual(["sun", "mon", "thu", "holiday"]);
    expect(withDay(form, "thu", false).days).toEqual(["sun", "holiday"]);
  });

  it("catches a number that isn't whole before saving", () => {
    const form = toScheduleForm(SETTINGS);
    expect(toPublishingUpdate({ ...form, perDay: "1.5", gapMinutes: "" }, 4)).toEqual({ ok: false, invalid: ["perDay", "gapMinutes"] });
    expect(toPublishingUpdate({ ...form, perDay: " 3 " }, 4)).toMatchObject({ ok: true, update: { perDay: 3 } });
  });
});

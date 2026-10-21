import { describe, expect, it } from "vitest";
import { slotTimes } from "@/lib/engine/mock/schedule";

describe("the mock's publishing slots (Fakher & Co: 2 a day, Sunday to Thursday)", () => {
  it("publishes at 10:00 and 13:00 Dubai time and skips Friday and Saturday", () => {
    expect(slotTimes(5)).toEqual([
      "2026-10-22T10:00:00+04:00",
      "2026-10-22T13:00:00+04:00",
      "2026-10-25T10:00:00+04:00",
      "2026-10-25T13:00:00+04:00",
      "2026-10-26T10:00:00+04:00",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import config from "../../vercel.json";

describe("the notifications cron (vercel.json)", () => {
  it("runs every 15 minutes, so Neon's free compute allowance lasts the month (final review)", () => {
    expect(config.crons).toEqual([{ path: "/api/cron/notifications", schedule: "*/15 * * * *" }]);
  });
});

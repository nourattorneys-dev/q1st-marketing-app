import { describe, expect, it } from "vitest";
import { connectedRow, socialRows } from "@/lib/settings/social";

const ACCOUNTS = [
  { platform: "linkedin", accountName: "Fakher & Co", status: "expiring", expiresAt: "2026-10-30T10:00:00+04:00", lastError: null },
  { platform: "instagram", accountName: null, status: "missing", expiresAt: null, lastError: null },
];

describe("the Social accounts rows (spec v1.1 §6 Social)", () => {
  it("lists the engine's accounts, and Google Search Console only with the performance feature", () => {
    expect(socialRows(ACCOUNTS, [], null).map((row) => row.key)).toEqual(["linkedin", "instagram"]);
    expect(socialRows(ACCOUNTS, ["performance"], undefined).at(-1)).toEqual({
      key: "searchConsole",
      status: "missing",
      accountName: null,
      expiresAt: null,
      lastError: null,
      searchConsole: true,
    });
  });

  it("gives an account the engine adds later its own row", () => {
    expect(socialRows([{ platform: "tiktok", status: "ok" }], [], null)).toMatchObject([{ key: "tiktok", status: "ok", searchConsole: false }]);
  });

  it("names the account that just connected only when its row is connected now, so a disconnect hides the notice (M3b follow-up)", () => {
    const rows = socialRows(ACCOUNTS, ["performance"], "ok");
    expect([
      connectedRow("instagram", rows),
      connectedRow("linkedin", rows),
      connectedRow(["searchConsole"], rows),
      connectedRow("<script>", rows),
      connectedRow(undefined, rows),
    ]).toEqual([null, "linkedin", "searchConsole", null, null]);
  });
});

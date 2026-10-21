import { describe, expect, it } from "vitest";
import { bulkFailureLines } from "@/lib/review/summary";

describe("bulkFailureLines", () => {
  it("names each failed post by its title, falling back to its id", () => {
    const lines = bulkFailureLines(
      { done: ["p_1"], failed: [{ id: "p_2", code: "framework_blocked", message: "Not approved" }, { id: "p_9", code: "not_found", message: "Gone" }] },
      [
        { id: "p_1", title: "First" },
        { id: "p_2", title: "Second" },
      ],
    );
    expect(lines).toEqual([
      { id: "p_2", title: "Second", message: "Not approved" },
      { id: "p_9", title: "p_9", message: "Gone" },
    ]);
  });
});

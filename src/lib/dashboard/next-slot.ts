import type { Scheduled } from "@/lib/engine/schemas";

export type NextSlotView = { kind: "slot"; at: string } | { kind: "off" } | { kind: "waiting"; reason: string };

export function nextSlotView(scheduled: Pick<Scheduled, "autoPublish" | "nextSlotAt" | "waitingReason">): NextSlotView {
  if (!scheduled.autoPublish) return { kind: "off" };
  if (scheduled.nextSlotAt) return { kind: "slot", at: scheduled.nextSlotAt };
  return { kind: "waiting", reason: scheduled.waitingReason ?? "queue_empty" };
}

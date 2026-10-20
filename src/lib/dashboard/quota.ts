import type { Quota } from "@/lib/engine/schemas";

export type QuotaState = "ok" | "warning" | "over" | "unlimited";
export type QuotaView = { metric: string; used: number; limit: number | null; percent: number; state: QuotaState };

export function quotaView(quota: Quota): QuotaView {
  const { metric, used, limit } = quota;
  if (limit === null) return { metric, used, limit, percent: 0, state: "unlimited" };

  const ratio = limit > 0 ? used / limit : used > 0 ? Number.POSITIVE_INFINITY : 0;
  const percent = Number.isFinite(ratio) ? Math.min(100, Math.max(0, Math.round(ratio * 100))) : 100;
  const warnAt = quota.warnAt ?? null;
  const state: QuotaState = ratio >= 1 ? "over" : warnAt !== null && ratio >= warnAt ? "warning" : "ok";

  return { metric, used, limit, percent, state };
}

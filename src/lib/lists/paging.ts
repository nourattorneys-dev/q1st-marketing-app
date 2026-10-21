/** The page asked for in ?page= (a missing or bad value means page 1). */
export function requestedPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

/** How many pages a list has, from the engine's list meta (spec v1.1 §3 Lists). */
export function pageCount(meta: { pageSize: number; total: number } | null): number {
  return meta && meta.pageSize > 0 ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;
}

import type { Usage } from "../schemas";
import { MOCK_SITE_ID } from "./fixtures";

/** This site's numbers per month in the mock (spec v1.1 §7 /account/usage); October 2026 is the plan period's month. */
const MONTHS: Record<string, Record<string, number>> = {
  "2026-05": { articles: 12, socialPosts: 30, photos: 20, publishes: 10, siteScans: 1, aiTokens: 420_000 },
  "2026-06": { articles: 16, socialPosts: 38, photos: 26, publishes: 14, siteScans: 1, aiTokens: 510_000 },
  "2026-07": { articles: 14, socialPosts: 35, photos: 22, publishes: 13, siteScans: 2, aiTokens: 480_000 },
  "2026-08": { articles: 20, socialPosts: 52, photos: 34, publishes: 18, siteScans: 1, aiTokens: 640_000 },
  "2026-09": { articles: 22, socialPosts: 61, photos: 41, publishes: 21, siteScans: 2, aiTokens: 700_000 },
  "2026-10": { articles: 24, socialPosts: 44, photos: 37, publishes: 19, siteScans: 2, aiTokens: 612_000 },
};
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Every month from `from` to `to` (YYYY-MM, at most 24); null when a month can't be read or the range runs backwards. */
export function mockUsage(from: string, to: string): Usage | null {
  const start = MONTH.exec(from);
  const end = MONTH.exec(to);
  if (!start || !end) return null;
  let index = Number(start[1]) * 12 + Number(start[2]) - 1;
  const last = Number(end[1]) * 12 + Number(end[2]) - 1;
  if (last < index || last - index >= 24) return null;
  const months: Usage["months"] = [];
  for (; index <= last; index++) {
    const month = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
    const metrics = MONTHS[month];
    months.push({ month, sites: metrics ? [{ siteId: MOCK_SITE_ID, metrics: { ...metrics } }] : [] });
  }
  return { months, results: [{ siteId: MOCK_SITE_ID, published: 41, keywordsCovered: 12 }] };
}

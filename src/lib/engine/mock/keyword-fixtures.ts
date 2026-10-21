import type { Keyword, Suggestion } from "../schemas";

const AT = "2026-10-20T10:00:00+04:00";

function keyword(fields: Pick<Keyword, "id" | "phrase" | "language" | "source" | "status"> & Partial<Keyword>): Keyword {
  return { rationale: null, uses: 0, addedBy: null, createdAt: AT, updatedAt: AT, ...fields };
}

function suggestion(fields: Pick<Suggestion, "id" | "title" | "kind" | "language" | "status"> & Partial<Suggestion>): Suggestion {
  return { keywords: [], why: null, postIds: [], createdAt: AT, ...fields };
}

export function seedKeywords(): Keyword[] {
  return [
    keyword({ id: "kw_1", phrase: "commission uae labour law", language: "en", source: "person", status: "approved", uses: 2, addedBy: { id: "u_1", name: "Sara" } }),
    keyword({ id: "kw_2", phrase: "unpaid commission dubai", language: "en", source: "ai", status: "approved", uses: 1, rationale: "People ask how to claim commission after they leave" }),
    keyword({ id: "kw_3", phrase: "end of service gratuity calculator uae", language: "en", source: "ai", status: "new", rationale: "High intent, and no page covers it" }),
    keyword({ id: "kw_4", phrase: "probation period uae labour law", language: "en", source: "ai", status: "covered", uses: 1, rationale: "A published article carries it" }),
    keyword({ id: "kw_5", phrase: "shareholder deadlock uae", language: "en", source: "ai", status: "new", rationale: "Rising searches from SME owners" }),
    keyword({ id: "kw_6", phrase: "eviction notice dubai 12 months", language: "en", source: "ai", status: "new", rationale: "Tenants search this before a renewal" }),
    keyword({ id: "kw_7", phrase: "مكافأة نهاية الخدمة", language: "ar", source: "ai", status: "new", rationale: "The Arabic search for gratuity; no Arabic page covers it" }),
    keyword({ id: "kw_8", phrase: "free zone company liquidation", language: "en", source: "person", status: "dismissed", addedBy: { id: "u_1", name: "Sara" } }),
    keyword({ id: "kw_9", phrase: "crypto tax dubai", language: "en", source: "ai", status: "off_strategy", rationale: "Outside the site's practice areas" }),
    keyword({ id: "kw_10", phrase: "off-plan property escrow dubai", language: "en", source: "ai", status: "approved", rationale: "Buyers search this before they sign" }),
    keyword({ id: "kw_11", phrase: "عقد العمل محدد المدة", language: "ar", source: "person", status: "approved", uses: 1, addedBy: { id: "u_2", name: "Omar" } }),
  ];
}

export function seedSuggestions(): Suggestion[] {
  return [
    suggestion({
      id: "sg_1",
      title: "End-of-service gratuity: how to work out what you're owed",
      kind: "blog",
      language: "en",
      status: "new",
      keywords: ["end of service gratuity calculator uae"],
      why: "Keyword proposed, not covered yet",
    }),
    suggestion({
      id: "sg_2",
      title: "What a shareholders' agreement should say about deadlock",
      kind: "blog",
      language: "en",
      status: "new",
      keywords: ["shareholder deadlock uae"],
      why: "Rising searches, and no page covers it",
    }),
    suggestion({
      id: "sg_3",
      title: "Three checks before you renew a Dubai lease",
      kind: "social",
      language: "en",
      status: "new",
      keywords: ["eviction notice dubai 12 months"],
      why: "Short practical tips do well on LinkedIn",
    }),
    suggestion({
      id: "sg_4",
      title: "كيف تُحسب مكافأة نهاية الخدمة؟",
      kind: "blog",
      language: "ar",
      status: "new",
      keywords: ["مكافأة نهاية الخدمة"],
      why: "Arabic keyword, not covered yet",
    }),
    suggestion({
      id: "sg_5",
      title: "When does a commission become payable under UAE Labour Law?",
      kind: "blog",
      language: "en",
      status: "drafted",
      keywords: ["commission uae labour law"],
      why: "Keyword approved, not covered yet",
      postIds: ["p_201", "p_202"],
    }),
    suggestion({
      id: "sg_6",
      title: "Crypto tax in Dubai",
      kind: "blog",
      language: "en",
      status: "dismissed",
      keywords: ["crypto tax dubai"],
      why: "Outside the site's strategy",
    }),
  ];
}

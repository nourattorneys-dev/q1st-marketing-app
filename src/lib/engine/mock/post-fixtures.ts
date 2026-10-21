import type { Post } from "../schemas";

export const SEED_DRAFTING_POST_ID = "p_207";
/** Approved posts, in queue order (spec v1.1 §6 /scheduled). */
export const SEED_QUEUE = ["p_101", "p_102", "p_103"];
/** A failed post whose next publish is refused once more by the website, then goes through (design §9 Retry). */
export const SEED_FAILING_PUBLISH = ["p_303"];
const SEEDED_AT = "2026-10-21T09:00:00+04:00";

type Required = Pick<Post, "id" | "kind" | "platform" | "language" | "status" | "title">;

function post(fields: Required & Partial<Post>): Post {
  return {
    keywords: [],
    hashtags: [],
    sources: [],
    linkSuggestions: [],
    findings: [],
    actions: [],
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    version: 1,
    requestedBy: "admin@example.com",
    ...fields,
  };
}

const LABOUR_LAW = "https://uaelegislation.gov.ae/en/legislations/1541";

const COMMISSION_EN =
  "<h2>When the commission is earned</h2>" +
  "<p>A commission is part of the wage when the contract or plan sets the percentage, the triggering event and the payment date.</p>" +
  "<ul><li>The employee's performance</li><li>The event that creates the right</li><li>The payment date</li></ul>" +
  "<h2>Rates by contract value</h2>" +
  "<table><tr><th>Contract value</th><th>Rate</th></tr><tr><td>Up to AED 1 million</td><td>2%</td></tr></table>" +
  "<blockquote>Article 53 requires payment within fourteen days of the end of the contract.</blockquote>" +
  `<p>Read the <a href="${LABOUR_LAW}">Labour Law</a> together with your commission plan.</p>`;

const COMMISSION_AR =
  "<h2>متى تُستحق العمولة</h2>" +
  "<p>تكون العمولة جزءاً من الأجر إذا حدد العقد أو النظام النسبة والواقعة المنشئة للحق وموعد السداد.</p>" +
  "<ul><li>أداء العامل</li><li>الواقعة المنشئة للحق</li><li>موعد السداد</li></ul>" +
  "<h2>النسب بحسب قيمة العقد</h2>" +
  "<table><tr><th>قيمة العقد</th><th>النسبة</th></tr><tr><td>حتى مليون درهم</td><td>2%</td></tr></table>" +
  "<blockquote>تلزم المادة 53 بالسداد خلال أربعة عشر يوماً من انتهاء العقد.</blockquote>" +
  `<p>اقرأ <a href="${LABOUR_LAW}">قانون العمل</a> مع نظام العمولات.</p>`;

const EVICTION_EN =
  "<h2>The 12-month notice</h2><p>A landlord who wants the property back must give notice twelve months ahead.</p>" +
  "<p>The notice must be sent by notary public or registered mail.</p>" +
  "<h2>Before the notice ends</h2><p>The tenant keeps every right under the lease until the date passes.</p>";

const EVICTION_AR = // one paragraph fewer than the English version → structure_mismatch
  "<h2>إشعار الاثني عشر شهراً</h2><p>على المؤجر الذي يريد استرداد العقار أن يرسل إشعاراً قبل اثني عشر شهراً.</p>" +
  "<h2>قبل انتهاء الإشعار</h2><p>يحتفظ المستأجر بجميع حقوقه بموجب العقد حتى انقضاء المدة.</p>";

const QUEUED_EN = "<h2>When the commission is earned</h2><p>The plan, the triggering event and the payment date decide it.</p>";
const QUEUED_AR = "<h2>متى تُستحق العمولة</h2><p>يحدد ذلك النظام والواقعة المنشئة للحق وموعد السداد.</p>";
const PROBATION_EN = "<h2>How long probation lasts</h2><p>Probation can't exceed six months, and the contract must say how long it is.</p>";

export function seedPosts(): Post[] {
  return [
    post({
      id: "p_201",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "pending",
      pairId: "p_202",
      title: "When does a commission become payable under UAE Labour Law?",
      subtitle: "The plan, the triggering event and the payment date decide it.",
      slug: "commission-payable-uae-labour-law",
      metaTitle: "When Is Commission Payable Under UAE Labour Law?",
      metaDescription: "When commission is earned under UAE Labour Law, what collection conditions mean, and claims after resignation.",
      keywords: ["commission uae labour law", "unpaid commission dubai"],
      section: "labour-law",
      content: COMMISSION_EN,
      sources: [{ title: "Federal Decree-Law No. 33 of 2021", url: LABOUR_LAW }],
    }),
    post({
      id: "p_202",
      kind: "blog",
      platform: "website",
      language: "ar",
      status: "pending",
      pairId: "p_201",
      title: "متى تستحق العمولة وفق قانون العمل الإماراتي؟",
      slug: "commission-payable-uae-labour-law-ar",
      metaTitle: "متى تستحق العمولة وفق قانون العمل الإماراتي؟",
      metaDescription: "متى تستحق العمولة وفق قانون العمل الإماراتي، وشرط التحصيل، وحق العامل بعد الاستقالة.",
      keywords: ["العمولة قانون العمل الإماراتي"],
      section: "labour-law",
      content: COMMISSION_AR,
      sources: [{ title: "المرسوم بقانون اتحادي رقم 33 لسنة 2021", url: LABOUR_LAW }],
    }),
    post({
      id: "p_203",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "pending",
      title: "Shareholder deadlock: your options under UAE company law",
      slug: "shareholder-deadlock-uae",
      metaTitle: "Shareholder Deadlock Options in the UAE",
      metaDescription:
        "Deadlock between shareholders can stall a company for months. This guide explains buy-outs, mediation, court-ordered exits and what to put in your agreement now to avoid it later.",
      keywords: ["shareholder deadlock uae"],
      section: "corporate",
      content:
        "<h2>What deadlock looks like</h2><p>Votes split evenly and nothing moves.</p>" +
        "<details><summary>Can the agreement prevent deadlock?</summary><p>Yes. It can set a casting vote or a buy-out formula in advance.</p></details>",
    }),
    post({
      id: "p_204",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "pending",
      pairId: "p_205",
      title: "Eviction notices in Dubai: the 12-month rule",
      slug: "eviction-notice-dubai-12-months",
      metaTitle: "Dubai Eviction Notice: The 12-Month Rule",
      metaDescription: "How the 12-month eviction notice works in Dubai and what tenants keep until it ends.",
      keywords: ["eviction notice dubai"],
      section: "real-estate",
      content: EVICTION_EN,
    }),
    post({
      id: "p_205",
      kind: "blog",
      platform: "website",
      language: "ar",
      status: "pending",
      pairId: "p_204",
      title: "إشعار الإخلاء في دبي: قاعدة الاثني عشر شهراً",
      slug: "eviction-notice-dubai-12-months-ar",
      metaTitle: "إشعار الإخلاء في دبي",
      metaDescription: "كيف يعمل إشعار الإخلاء لمدة اثني عشر شهراً في دبي.",
      keywords: ["إشعار الإخلاء دبي"],
      section: "real-estate",
      content: EVICTION_AR,
    }),
    post({
      id: "p_206",
      kind: "social",
      platform: "linkedin",
      language: "en",
      status: "pending",
      title: "Commission rights after resignation",
      content: "Resigning doesn't cancel a commission you've already earned. What matters is when the plan says it's due.",
      hashtags: ["#UAELabourLaw", "#Dubai"],
    }),
    post({
      id: SEED_DRAFTING_POST_ID,
      kind: "blog",
      platform: "website",
      language: "en",
      status: "drafting",
      title: "Probation periods under the UAE Labour Law",
      content: "",
    }),
    post({
      id: "p_208",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "pending",
      title: "Off-plan property: what to check before signing",
      slug: "off-plan-property-checklist-dubai",
      metaTitle: "Off-Plan Property Checklist for Dubai Buyers",
      metaDescription: "What to check in an off-plan sale agreement before you sign.",
      keywords: ["off-plan property dubai"],
      section: "real-estate",
      content: "<h2>Read the escrow clause</h2><p>Payments must go to the project's escrow account.</p>",
      lock: { by: "omar@example.com", at: SEEDED_AT, expiresAt: "2099-01-01T00:00:00+04:00" },
    }),
    post({
      id: "p_209",
      kind: "social",
      platform: "instagram",
      language: "en",
      status: "pending",
      title: "Three checks before you sign an off-plan contract",
      content: "Check the escrow account, the completion date and the developer's registration before you sign.",
      hashtags: ["#DubaiProperty", "#OffPlan"],
      photoIdea: "keys and a signed contract on a desk",
    }),
    post({
      id: "p_101",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "approved",
      pairId: "p_102",
      title: "When does a commission become payable under UAE Labour Law?",
      slug: "commission-payable-uae-labour-law-guide",
      metaTitle: "When Is Commission Payable in the UAE?",
      metaDescription: "How the contract, the commission plan and the payment date decide when a commission is owed.",
      keywords: ["commission uae labour law"],
      section: "labour-law",
      content: QUEUED_EN,
      reviewedBy: "omar@example.com",
      schedule: { hold: false, scheduledAt: null, position: null },
    }),
    post({
      id: "p_102",
      kind: "blog",
      platform: "website",
      language: "ar",
      status: "approved",
      pairId: "p_101",
      title: "متى تستحق العمولة وفق قانون العمل الإماراتي؟",
      slug: "commission-payable-uae-labour-law-guide-ar",
      keywords: ["العمولة قانون العمل الإماراتي"],
      section: "labour-law",
      content: QUEUED_AR,
      reviewedBy: "omar@example.com",
      schedule: { hold: false, scheduledAt: null, position: null },
    }),
    post({
      id: "p_103",
      kind: "social",
      platform: "linkedin",
      language: "en",
      status: "approved",
      title: "Commission rights after resignation",
      content: "Resigning doesn't cancel a commission you've already earned.",
      hashtags: ["#UAELabourLaw"],
      reviewedBy: "omar@example.com",
      schedule: { hold: true, scheduledAt: null, position: null },
    }),
    post({
      id: "p_301",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "published",
      title: "Probation periods under the UAE Labour Law",
      slug: "probation-period-uae-labour-law",
      keywords: ["probation period uae"],
      section: "labour-law",
      content: PROBATION_EN,
      overrideReason: "Length agreed with the client",
      reviewedBy: "omar@example.com",
      published: { target: "wordpress", url: "https://fakhernco.com/probation-period-uae-labour-law/", externalId: "8840", at: "2026-10-19T10:00:00+04:00" },
      updatedAt: "2026-10-19T10:00:00+04:00",
    }),
    post({
      id: "p_302",
      kind: "social",
      platform: "linkedin",
      language: "en",
      status: "published",
      title: "Notice periods: what an employer must give",
      content: "A notice period of at least 30 days applies to both sides, unless the contract says more.",
      hashtags: ["#UAELabourLaw"],
      reviewedBy: "omar@example.com",
      published: {
        target: "linkedin",
        url: "https://www.linkedin.com/feed/update/urn:li:share:7001",
        externalId: "urn:li:share:7001",
        at: "2026-10-20T13:00:00+04:00",
      },
      updatedAt: "2026-10-20T13:00:00+04:00",
    }),
    post({
      id: "p_303",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "failed",
      title: "End-of-service gratuity for part-time employees",
      slug: "gratuity-part-time-employees-uae",
      keywords: ["gratuity part time uae"],
      section: "labour-law",
      content: "<h2>Who qualifies</h2><p>Part-time employees earn gratuity in proportion to the hours they work.</p>",
      error: "WordPress refused the request: 503 Service Unavailable.",
      reviewedBy: "omar@example.com",
      updatedAt: "2026-10-20T16:00:00+04:00",
    }),
    post({
      id: "p_304",
      kind: "blog",
      platform: "website",
      language: "en",
      status: "rejected",
      title: "Five myths about free zone licences",
      content: "<p>Free zone licences come with rules that are often misunderstood.</p>",
      reviewNote: "Off-topic for this quarter",
      reviewedBy: "omar@example.com",
      updatedAt: "2026-10-18T12:00:00+04:00",
    }),
  ];
}

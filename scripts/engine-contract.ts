/**
 * Contract check: calls the dashboard's own engine functions against a LIVE engine and validates every answer with the
 * dashboard's own schemas. Reads first, then a safe write sequence on a test site. Prints one line per call.
 * Usage: ENGINE_BASE_URL=https://api.q1st.io/api/v1 ENGINE_API_KEY=... [WRITES=1] pnpm tsx --conditions=react-server scripts/engine-contract.ts
 */
import { createEngineClient } from "../src/lib/engine/client";
import { createEngineApi } from "../src/lib/engine/api";

const api = createEngineApi(createEngineClient({ baseUrl: process.env.ENGINE_BASE_URL!, apiKey: process.env.ENGINE_API_KEY!, fetch, timeoutMs: 120_000 }));
const ctx = () => ({ actingUser: "contract-check", idempotencyKey: crypto.randomUUID() });
let pass = 0, fail = 0;
const results: Record<string, unknown> = {};

async function call(name: string, run: () => Promise<unknown>, expectError?: string) {
  try {
    const v = await run();
    results[name] = v;
    if (expectError) { fail++; console.log(`FAIL  ${name}: expected error ${expectError}, got success`); return v; }
    const skipped = (v as any)?.skipped;                              // list items the dashboard could not read are dropped, not thrown
    if (Array.isArray(skipped) ? skipped.length : Number(skipped) > 0) {
      fail++; console.log(`FAIL  ${name}: ${Array.isArray(skipped) ? skipped.length : skipped} item(s) in an unexpected format were skipped\n        ${JSON.stringify(skipped).slice(0, 800)}`);
      return v;
    }
    pass++; console.log(`PASS  ${name}`);
    return v;
  } catch (e: any) {
    const code = e?.code ?? e?.name, det = e?.details?.issues ?? e?.details ?? "";
    if (expectError && code === expectError) { pass++; console.log(`PASS  ${name} (refused: ${code})`); return; }
    fail++;
    console.log(`FAIL  ${name}: ${e?.status ?? ""} ${code}: ${e?.message}${det ? "\n        " + String(typeof det === "string" ? det : JSON.stringify(det)).replace(/\n/g, "\n        ").slice(0, 1500) : ""}`);
  }
}

async function main() {
  // ---- reads (every page's first load)
  await call("meta", () => api.meta());
  await call("site", () => api.site());
  await call("siteCounts", () => api.siteCounts());
  await call("siteConnections", () => api.siteConnections());
  await call("plan (/account/plan)", () => api.plan());
  await call("usage (/account/usage)", () => (api as any).usage());
  await call("scheduled", () => api.scheduled({ pageSize: 5 }));
  await call("listPosts", () => api.listPosts({ statuses: ["pending"] }));
  await call("listKeywords", () => api.listKeywords({ statuses: ["new"] }));
  await call("listSuggestions", () => api.listSuggestions({ statuses: ["new"] }));
  await call("seoSettings", () => (api as any).seoSettings());
  await call("publishingSettings", () => (api as any).publishingSettings());
  await call("websiteSettings", () => (api as any).websiteSettings());
  await call("socialConnections", () => (api as any).socialConnections());
  await call("listFindings (site health)", () => api.listFindings({ statuses: ["open"] }));
  await call("webhookSettings", () => (api as any).webhookSettings());
  await call("searchPhotos", () => api.searchPhotos("dubai office", 1));
  if (!process.env.WRITES) { console.log(`-----\nPASSED ${pass}   FAILED ${fail}`); return; }

  // ---- writes on the test site (WordPress as drafts)
  const wp = { type: "wordpress", settings: { url: process.env.WP_URL!, username: process.env.WP_USER!, postType: "post", publishAs: "draft" },
               secret: process.env.WP_PASS!, fieldMap: {}, body: { format: "html" }, arabic: { mode: "translatepress" } };
  const t = (await call("testWebsite", () => api.testWebsite(wp, ctx()))) as any;
  const cur = (await api.websiteSettings()) as any;
  await call("saveWebsite", () => api.saveWebsite({ ...wp, fieldMap: t?.suggestedFieldMap ?? {}, version: cur.version }, ctx()));
  await call("categories", () => api.categories());
  const pub = (await api.publishingSettings()) as any;
  await call("savePublishing", () => api.savePublishing({ ...pub, autoPublish: false }, ctx()));
  const seo = (await api.seoSettings()) as any;
  await call("saveSeo", () => api.saveSeo({ ...seo, tone: "clear, expert", audience: "UAE business owners" }, ctx()));
  const phrase = `uae labour law contract test ${Date.now()}`;          // new each run: a duplicate is (rightly) not added again
  const kw = (await call("addKeywords", () => api.addKeywords([phrase], "en", ctx()))) as any;
  const kwIds = (Array.isArray(kw) ? kw : []).map((k: any) => k.id);
  await call("bulkKeywords approve", () => api.bulkKeywords("approve", kwIds, ctx()));
  const d = (await call("createDrafts (blog, en)", () => api.createDrafts({ topic: "Probation periods under UAE labour law", kind: "blog", platform: "website", language: "en" }, ctx()))) as any;
  const jobId = d?.jobId; const pid = d?.postIds?.[0];
  for (let i = 0; jobId && i < 120; i++) {
    const j = (await api.job(jobId)) as any;
    if (j.status === "done" || j.status === "failed") { console.log(`      draft job ${j.status}`); break; }
    await new Promise((r) => setTimeout(r, 5000));
  }
  await call("job", () => api.job(jobId));
  await call("post", () => api.post(pid));
  await call("lockPost", () => api.lockPost(pid, ctx()));
  const p0 = (await api.post(pid)) as any;
  await call("savePost", () => api.savePost(pid, { version: p0.version, title: p0.title + " (edited)" } as any, ctx()));
  await call("exportPost html", () => api.exportPost(pid, "html"));
  await call("unlockPost", () => api.unlockPost(pid, ctx()));
  const p1 = (await api.post(pid)) as any;
  const crit = (p1.findings ?? []).some((f: any) => f.level === "critical");
  await call("approvePost", () => api.approvePost(pid, crit ? "contract check" : undefined, ctx()));
  await call("scheduled (with a post)", () => api.scheduled({ pageSize: 5 }));
  await call("holdPost", () => api.holdPost(pid, true, ctx()));
  await call("holdPost resume", () => api.holdPost(pid, false, ctx()));
  const done = (await call("publishPost (WordPress draft)", () => api.publishPost(pid, ctx()))) as any;
  console.log(`      published: ${JSON.stringify(done?.published ?? null)}`);
  await call("listPosts published", () => api.listPosts({ statuses: ["published"] }));
  const s = (await call("createDrafts (social)", () => api.createDrafts({ topic: "Probation periods in the UAE", kind: "social", platform: "linkedin", language: "en" }, ctx()))) as any;
  for (let i = 0; s?.jobId && i < 60; i++) {
    const j = (await api.job(s.jobId)) as any;
    if (j.status === "done" || j.status === "failed") break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  const sid = s?.postIds?.[0];
  await call("rejectPost", () => api.rejectPost(sid, "contract check", ctx()));
  await call("deletePost", () => api.deletePost(sid, ctx()));
  await call("bulkPosts (unknown id)", () => api.bulkPosts("approve", ["p_doesnotexist"], undefined, ctx()));
  console.log(`-----\nPASSED ${pass}   FAILED ${fail}`);
}

main();

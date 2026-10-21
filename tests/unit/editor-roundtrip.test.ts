import { generateHTML, generateJSON } from "@tiptap/html";
import { describe, expect, it } from "vitest";
import { editorExtensions } from "@/components/editor/extensions";

const ARTICLE =
  "<h2>When the commission is earned</h2>" +
  '<p>Read the <a href="https://uaelegislation.gov.ae/en/legislations/1541">Labour Law</a> with <strong>your plan</strong>.</p>' +
  "<h3>Steps</h3><h4>Detail</h4>" +
  "<ul><li>Performance</li><li>Event</li></ul><ol><li>First</li></ol>" +
  "<table><tr><th>Contract value</th><th>Rate</th></tr><tr><td>Up to AED 1 million</td><td>2%</td></tr></table>" +
  "<blockquote>Article 53</blockquote>";

describe("the editor keeps the engine's article HTML (Review Focus 1)", () => {
  const roundTrip = (html: string) => generateHTML(generateJSON(html, editorExtensions), editorExtensions);

  it("keeps headings, links, emphasis, lists, tables and quotes", () => {
    const out = roundTrip(ARTICLE);
    for (const fragment of [
      "<h2>When the commission is earned</h2>",
      'href="https://uaelegislation.gov.ae/en/legislations/1541"',
      "<strong>your plan</strong>",
      "<h3>Steps</h3>",
      "<h4>Detail</h4>",
      "<ul>",
      "<ol>",
      "<table",
      "Contract value",
      "Up to AED 1 million",
      "<blockquote>",
      "Article 53",
    ]) {
      expect(out).toContain(fragment);
    }
  });

  it("is stable: a second round trip changes nothing", () => {
    const once = roundTrip(ARTICLE);
    expect(roundTrip(once)).toBe(once);
  });
});

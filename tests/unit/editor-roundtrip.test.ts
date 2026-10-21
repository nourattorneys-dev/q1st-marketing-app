import { generateHTML, generateJSON } from "@tiptap/html";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { editorExtensions } from "@/components/editor/extensions";
import { lostElements } from "@/lib/editor/fidelity";

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

describe("the editor doesn't change what it can keep (final review)", () => {
  const roundTrip = (html: string) => generateHTML(generateJSON(html, editorExtensions), editorExtensions);

  it("keeps links exactly as they were, adding no target or rel", () => {
    const out = roundTrip('<p>See <a href="/services/labour">our labour services</a> and <a href="https://example.com" target="_blank" rel="noopener">this</a>.</p>');
    expect(out).toContain('<a href="/services/labour">our labour services</a>');
    expect(out).toMatch(/<a (?=[^>]*target="_blank")(?=[^>]*rel="noopener")(?=[^>]*href="https:\/\/example\.com")[^>]*>this<\/a>/);
    expect(out).not.toContain("nofollow");
  });

  it("keeps images, every heading level, superscript and subscript (spec v1.1 §11)", () => {
    const out = roundTrip('<h1>A</h1><h5>B</h5><h6>C</h6><img src="https://example.com/a.jpg" alt="Court"><p>Fee<sup>1</sup> and H<sub>2</sub>O</p>');
    for (const fragment of ["<h1>A</h1>", "<h5>B</h5>", "<h6>C</h6>", 'src="https://example.com/a.jpg"', 'alt="Court"', "<sup>1</sup>", "<sub>2</sub>"]) {
      expect(out).toContain(fragment);
    }
  });
});

describe("content the editor can't keep is reported, so the body can stay read-only (final review)", () => {
  const roundTrip = (html: string) => generateHTML(generateJSON(html, editorExtensions), editorExtensions);
  const parse = (html: string) => new new Window().DOMParser().parseFromString(html, "text/html") as unknown as Document;

  it("names the elements a save would lose", () => {
    const html =
      "<p>Intro</p><details><summary>Is it payable?</summary><p>Yes.</p></details>" +
      "<figure><img src='https://example.com/a.jpg' alt='A'><figcaption>Photo credit</figcaption></figure>";
    expect(lostElements(html, roundTrip(html), parse)).toEqual(["details", "figcaption", "figure", "summary"]);
  });

  it("finds nothing lost in an ordinary article, including renamed tags like <b>", () => {
    expect(lostElements(ARTICLE, roundTrip(ARTICLE), parse)).toEqual([]);
    expect(lostElements("<p><b>Bold</b> <i>it</i></p>", roundTrip("<p><b>Bold</b> <i>it</i></p>"), parse)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { draftLanguageOptions, platformsFor } from "@/lib/drafting/choices";
import { keywordTab, tabActions, tabStatuses } from "@/lib/keywords/tabs";

describe("keyword tabs (spec v1.1 §6 /keywords)", () => {
  it("reads the tab from ?tab=, defaulting to New", () => {
    expect([keywordTab(undefined), keywordTab("covered"), keywordTab(["inUse", "new"]), keywordTab("everything")]).toEqual(["new", "covered", "inUse", "new"]);
  });

  it("lists off-strategy keywords with the dismissed ones", () => {
    expect([tabStatuses("new"), tabStatuses("inUse"), tabStatuses("covered"), tabStatuses("dismissed")]).toEqual([
      ["new"],
      ["approved"],
      ["covered"],
      ["dismissed", "off_strategy"],
    ]);
  });

  it("offers each tab's buttons: approve and dismiss new keywords, restore dismissed ones, topics and drafts from new or in-use ones", () => {
    expect(tabActions("new")).toEqual({ approve: true, dismiss: true, restore: false, topics: true, draft: true });
    expect(tabActions("inUse")).toEqual({ approve: false, dismiss: true, restore: false, topics: true, draft: true });
    expect(tabActions("covered")).toEqual({ approve: false, dismiss: false, restore: false, topics: false, draft: false });
    expect(tabActions("dismissed")).toEqual({ approve: false, dismiss: false, restore: true, topics: false, draft: false });
  });
});

describe("drafting languages (spec v1.1 §6: en, ar or both)", () => {
  it("adds both only when the site has more than one language", () => {
    expect([draftLanguageOptions(["en", "ar"]), draftLanguageOptions(["en"])]).toEqual([["en", "ar", "both"], ["en"]]);
  });
});

describe("new-request platforms (spec v1.1 §4 Post.platform)", () => {
  it("sends an article to the website and a social post to a social platform", () => {
    const platforms = ["website", "linkedin", "instagram"];
    expect([platformsFor("blog", platforms), platformsFor("social", platforms)]).toEqual([["website"], ["linkedin", "instagram"]]);
  });
});

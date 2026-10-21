/** Keyword tabs (spec v1.1 §6). The AI's off-strategy keywords sit with the dismissed ones; Restore moves both back to New. */
export const KEYWORD_TABS = ["new", "inUse", "covered", "dismissed"] as const;
export type KeywordTab = (typeof KEYWORD_TABS)[number];

const STATUSES: Record<KeywordTab, string[]> = {
  new: ["new"],
  inUse: ["approved"],
  covered: ["covered"],
  dismissed: ["dismissed", "off_strategy"],
};

export function keywordTab(value: string | string[] | undefined): KeywordTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return (KEYWORD_TABS as readonly string[]).includes(raw ?? "") ? (raw as KeywordTab) : "new";
}

export const tabStatuses = (tab: KeywordTab): string[] => STATUSES[tab];

/** The buttons each tab offers (spec v1.1 §5, §6). The engine still decides; refusals come back by phrase. */
export function tabActions(tab: KeywordTab) {
  const usable = tab === "new" || tab === "inUse";
  return { approve: tab === "new", dismiss: usable, restore: tab === "dismissed", topics: usable, draft: usable };
}

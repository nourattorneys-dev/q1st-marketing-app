/** Finding tabs (spec v1.1 §4 SiteFinding.status): what still needs a decision, then what's done. */
export const FINDING_TABS = {
  todo: ["open", "prepared"],
  applied: ["applied"],
  dismissed: ["dismissed"],
} as const;
export type FindingTab = keyof typeof FINDING_TABS;
export const FINDING_TAB_KEYS = Object.keys(FINDING_TABS) as FindingTab[];

export function findingTab(value: string | string[] | undefined): FindingTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab && Object.hasOwn(FINDING_TABS, tab) ? (tab as FindingTab) : "todo";
}

export const tabStatuses = (tab: FindingTab): string[] => [...FINDING_TABS[tab]];

/**
 * What a person can do with a finding: choose an open one to prepare a fix for, apply a prepared fix (Admin only,
 * because it changes the live website: design §5), and dismiss one that's still open or prepared.
 */
export function findingActions(finding: { status: string }, canApply: boolean) {
  return {
    select: finding.status === "open",
    apply: canApply && finding.status === "prepared",
    dismiss: finding.status === "open" || finding.status === "prepared",
  };
}

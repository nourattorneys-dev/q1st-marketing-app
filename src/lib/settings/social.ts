import type { SocialConnection } from "@/lib/engine/schemas";

export type SocialRow = {
  key: string;
  status: string;
  accountName: string | null;
  expiresAt: string | null;
  lastError: string | null;
  searchConsole: boolean;
};

/** One row per account GET …/settings/social lists, then Google Search Console when /meta.features has "performance" (spec v1.1 §6, §12). */
export function socialRows(connections: SocialConnection[], features: string[], searchConsole: string | null | undefined): SocialRow[] {
  const rows: SocialRow[] = connections.map((connection) => ({
    key: connection.platform,
    status: connection.status,
    accountName: connection.accountName ?? null,
    expiresAt: connection.expiresAt ?? null,
    lastError: connection.lastError ?? null,
    searchConsole: false,
  }));
  if (features.includes("performance")) {
    rows.push({ key: "searchConsole", status: searchConsole ?? "missing", accountName: null, expiresAt: null, lastError: null, searchConsole: true });
  }
  return rows;
}

/** `?connected=…` after the OAuth round trip (spec v1.1 §7): a row on this page, or null for anything else. */
export function connectedRow(value: string | string[] | undefined, rows: SocialRow[]): string | null {
  const key = Array.isArray(value) ? value[0] : value;
  return key && rows.some((row) => row.key === key) ? key : null;
}

import type { Site } from "@/lib/engine/schemas";

export const CONNECTION_KEYS = ["website", "linkedin", "instagram", "searchConsole"] as const;
export type ConnectionKey = (typeof CONNECTION_KEYS)[number];

/** Every reported connection whose status isn't "ok", including statuses the interface doesn't know yet. */
export function connectionWarnings(connections: Site["connections"]): { key: ConnectionKey; status: string }[] {
  const statuses: Record<ConnectionKey, string | null | undefined> = {
    website: connections.website.status,
    linkedin: connections.linkedin,
    instagram: connections.instagram,
    searchConsole: connections.searchConsole,
  };
  return CONNECTION_KEYS.flatMap((key) => {
    const status = statuses[key];
    return status && status !== "ok" ? [{ key, status }] : [];
  });
}

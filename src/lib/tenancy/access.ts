import type { Role } from "@/lib/auth/roles";

/** A site as the pages see it: never its engine key. */
export type SiteRef = { id: string; name: string };

/**
 * The sites a person may open (P1b): an Admin every site of the client; a Reviewer the ones granted to them, or every
 * site when nothing is granted (the invitation's default). No role: none.
 */
export function sitesFor<S extends SiteRef>(role: Role | null, all: S[], granted: string[]): S[] {
  if (!role) return [];
  if (role === "admin" || granted.length === 0) return all;
  const allowed = new Set(granted);
  return all.filter((site) => allowed.has(site.id));
}

/** The site to work on: the one saved on the session while the person may still open it, else the first they may open. */
export function chooseSite<S extends SiteRef>(allowed: S[], saved: string | null): S | null {
  return allowed.find((site) => site.id === saved) ?? allowed[0] ?? null;
}

/** Site ids chosen on the Users page, kept to the client's own sites; all of them (or none) means "every site". */
export function grantedSites(chosen: string[] | null | undefined, all: SiteRef[]): string[] | null {
  if (!chosen) return null;
  const known = new Set(all.map((site) => site.id));
  const kept = [...new Set(chosen.filter((id) => known.has(id)))];
  return kept.length === 0 || kept.length === all.length ? null : kept;
}

/**
 * Each client at its own address (CLIENT_DOMAIN): <name>.<domain>, e.g. fakher.q1st.io. Pure functions: the request's
 * host and the settings come in, so the rules are tested without a server.
 */
type AddressEnv = { appUrl: string | null; clientDomain: { domain: string; reserved: string[] } | null };

/** A DNS name of one label: lowercase letters, digits and inner hyphens, 1–63 characters. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type NameProblem = "format" | "reserved";

/** Why a name can't be a client's address, or null. */
export function clientNameProblem(name: string, env: AddressEnv): NameProblem | null {
  if (!LABEL.test(name)) return "format";
  return env.clientDomain?.reserved.includes(name) ? "reserved" : null;
}

/** The client name a request's host carries ("fakher" for fakher.q1st.io), or null (APP_URL, a reserved name, another host). */
export function clientNameOfHost(host: string | null, env: AddressEnv): string | null {
  if (!host || !env.clientDomain) return null;
  const name = host.toLowerCase().replace(/:\d+$/, "");
  const suffix = `.${env.clientDomain.domain}`;
  if (!name.endsWith(suffix)) return null;
  const label = name.slice(0, -suffix.length);
  return clientNameProblem(label, env) ? null : label;
}

/** Where a client's people work: its own address when it has a name and CLIENT_DOMAIN is set, else APP_URL. */
export function clientOrigin(client: { slug: string | null } | null, env: AddressEnv): string | null {
  if (client?.slug && env.clientDomain && env.appUrl) return `${new URL(env.appUrl).protocol}//${client.slug}.${env.clientDomain.domain}`;
  return env.appUrl;
}

/** Whether a request from this origin is one of ours (APP_URL, or a client address under CLIENT_DOMAIN over the same scheme). */
export function isOurOrigin(origin: string | null, env: AddressEnv): boolean {
  if (!origin || !env.appUrl) return false;
  if (origin === env.appUrl) return true;
  if (!URL.canParse(origin)) return false;
  const url = new URL(origin);
  return url.protocol === new URL(env.appUrl).protocol && url.origin === origin && clientNameOfHost(url.host, env) !== null;
}

import { MailError, type MailErrorKind } from "./mail-error";
import type { Email, Mailer } from "./mailer";

/**
 * EMAIL_MODE=graph: Microsoft 365 through Microsoft Graph, as an app (client credentials). The app registration needs
 * only the Mail.Send application permission, limited in Exchange to the one sender mailbox (application access policy).
 */
export type GraphSettings = { tenantId: string; clientId: string; clientSecret: string; fromName: string | null; fromAddress: string };

/** The time limit for one call to Microsoft (sign-in or send). */
export const GRAPH_LIMITS = { requestMs: 30_000 };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Token = { value: string; expiresAt: number };

const LOGIN = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";
// A token is renewed this long before Microsoft says it expires, so a send never starts with one about to lapse.
const RENEW_EARLY_MS = 120_000;

/** Microsoft's own reason, one line: the error's message or description. Never the secret, which is only ever sent. */
async function reasonOf(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const record = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const inner = (typeof record.error === "object" && record.error !== null ? record.error : {}) as Record<string, unknown>;
  const said = [inner.code, inner.message, record.error_description, typeof record.error === "string" ? record.error : null].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return `${response.status}${said.length ? ` ${said.join(": ")}` : ""}`.split(/\r?\n/)[0].slice(0, 300);
}

function kindFor(status: number): MailErrorKind {
  if (status === 401 || status === 403) return "login";
  if (status === 400 || status === 404) return "refused";
  return "other";
}

export function createGraphMailer(settings: GraphSettings, options: { fetch?: Fetch; limits?: typeof GRAPH_LIMITS } = {}): Mailer {
  const call: Fetch = options.fetch ?? ((url, init) => fetch(url, init));
  const limits = options.limits ?? GRAPH_LIMITS;
  let token: Token | null = null;

  async function request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await call(url, { ...init, signal: AbortSignal.timeout(limits.requestMs) });
    } catch (error) {
      const reason = error instanceof Error ? (error.name === "TimeoutError" ? `no answer within ${limits.requestMs / 1000} s` : error.message) : "no answer";
      throw new MailError("connect", reason.slice(0, 300));
    }
  }

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt - RENEW_EARLY_MS > Date.now()) return token.value;
    const response = await request(`${LOGIN}/${encodeURIComponent(settings.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (!response.ok) throw new MailError(response.status >= 500 ? "other" : "login", await reasonOf(response));
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new MailError("login", "Microsoft answered without an access token.");
    token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 0) * 1000 };
    return token.value;
  }

  return {
    async send(email: Email) {
      const message = {
        subject: email.subject,
        body: { contentType: "HTML", content: email.html },
        toRecipients: [{ emailAddress: { address: email.to } }],
        from: { emailAddress: { address: settings.fromAddress, ...(settings.fromName ? { name: settings.fromName } : {}) } },
        // Graph accepts only X- headers here. The first asks Exchange not to send automatic replies (out of office)
        // back to the sender mailbox; the second lets a repeated email be traced to the same notification.
        internetMessageHeaders: [
          { name: "X-Auto-Response-Suppress", value: "All" },
          { name: "X-Notification-Key", value: email.idempotencyKey.slice(0, 900) },
        ],
      };
      const send = async () =>
        request(`${GRAPH}/users/${encodeURIComponent(settings.fromAddress)}/sendMail`, {
          method: "POST",
          headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message, saveToSentItems: false }),
        });
      let response = await send();
      if (response.status === 401) {
        token = null; // a token Microsoft no longer accepts (revoked or rotated secret): sign in again, once
        response = await send();
      }
      if (response.status !== 202 && !response.ok) throw new MailError(kindFor(response.status), await reasonOf(response));
    },
  };
}

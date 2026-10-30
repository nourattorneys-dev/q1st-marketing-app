import { describe, expect, it } from "vitest";
import { createGraphMailer, type GraphSettings } from "@/lib/notifications/graph-mailer";
import { MailError } from "@/lib/notifications/mail-error";
import { mailerFor, type Email } from "@/lib/notifications/mailer";
import { parseServicesEnv } from "@/lib/services-env";

const SECRET = "s3cr3t~value";
const SETTINGS: GraphSettings = { tenantId: "tenant-1", clientId: "client-1", clientSecret: SECRET, fromName: "Q1st", fromAddress: "notifications@quantum1st.com" };
const EMAIL: Email = { to: "sara@client.example", subject: "Invitation", html: "<p>مرحبا</p>", text: "مرحبا", idempotencyKey: "invite-1" };

type Call = { url: string; init: RequestInit };
/** A fake Microsoft: answers come from the list in order (token answers and send answers mixed as the test needs). */
function fakeMicrosoft(answers: Array<Response | Error>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (!next) throw new Error("no answer queued");
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetch };
}
const token = (value = "tok-1", expiresIn = 3600) => Response.json({ access_token: value, expires_in: expiresIn });
const accepted = () => new Response(null, { status: 202 });
const failed = (status: number, code: string, message: string) => Response.json({ error: { code, message } }, { status });

async function failure(run: () => Promise<unknown>): Promise<MailError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof MailError) return error;
    throw error;
  }
  throw new Error("did not fail");
}

describe("the Microsoft 365 mailer (EMAIL_MODE=graph)", () => {
  it("signs in as the app, then sends from the sender mailbox, as HTML, to the person, without keeping a copy", async () => {
    const ms = fakeMicrosoft([token(), accepted()]);
    await createGraphMailer(SETTINGS, { fetch: ms.fetch }).send(EMAIL);
    expect(ms.calls[0].url).toBe("https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token");
    const form = new URLSearchParams(String(ms.calls[0].init.body));
    expect(Object.fromEntries(form)).toEqual({ client_id: "client-1", client_secret: SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
    expect(ms.calls[1].url).toBe("https://graph.microsoft.com/v1.0/users/notifications%40quantum1st.com/sendMail");
    expect((ms.calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    const body = JSON.parse(String(ms.calls[1].init.body));
    expect(body.saveToSentItems).toBe(false);
    expect(body.message).toMatchObject({
      subject: "Invitation",
      body: { contentType: "HTML", content: "<p>مرحبا</p>" },
      toRecipients: [{ emailAddress: { address: "sara@client.example" } }],
      from: { emailAddress: { address: "notifications@quantum1st.com", name: "Q1st" } },
    });
    expect(body.message.internetMessageHeaders).toEqual([
      { name: "X-Auto-Response-Suppress", value: "All" },
      { name: "X-Notification-Key", value: "invite-1" },
    ]);
  });

  it("signs in once and reuses the token for the next emails", async () => {
    const ms = fakeMicrosoft([token(), accepted(), accepted(), accepted()]);
    const mailer = createGraphMailer(SETTINGS, { fetch: ms.fetch });
    for (let i = 0; i < 3; i++) await mailer.send({ ...EMAIL, idempotencyKey: `k${i}` });
    expect(ms.calls.filter((call) => call.url.includes("/oauth2/")).length).toBe(1);
  });

  it("signs in again when the token is about to run out", async () => {
    const ms = fakeMicrosoft([token("old", 60), accepted(), token("new"), accepted()]);
    const mailer = createGraphMailer(SETTINGS, { fetch: ms.fetch });
    await mailer.send(EMAIL);
    await mailer.send(EMAIL);
    expect((ms.calls[3].init.headers as Record<string, string>).Authorization).toBe("Bearer new");
  });

  it("a token Microsoft refuses (401) is replaced once, then the send goes through", async () => {
    const ms = fakeMicrosoft([token("stale"), failed(401, "InvalidAuthenticationToken", "expired"), token("fresh"), accepted()]);
    await createGraphMailer(SETTINGS, { fetch: ms.fetch }).send(EMAIL);
    expect(ms.calls.length).toBe(4);
  });

  it("a wrong secret is a sign-in failure with Microsoft's reason, never the secret", async () => {
    const ms = fakeMicrosoft([Response.json({ error: "invalid_client", error_description: `AADSTS7000215: Invalid client secret provided.` }, { status: 401 })]);
    const error = await failure(() => createGraphMailer(SETTINGS, { fetch: ms.fetch }).send(EMAIL));
    expect(error.kind).toBe("login");
    expect(error.reply).toContain("AADSTS7000215");
    expect(error.message).not.toContain(SECRET);
  });

  it("a mailbox the app may not send from (403: access policy) is a sign-in failure, named", async () => {
    const ms = fakeMicrosoft([token(), failed(403, "ErrorAccessDenied", "Access is denied. Check credentials and try again.")]);
    const error = await failure(() => createGraphMailer(SETTINGS, { fetch: ms.fetch }).send(EMAIL));
    expect(error.kind).toBe("login");
    expect(error.reply).toBe("403 ErrorAccessDenied: Access is denied. Check credentials and try again.");
  });

  it("a refused message (400: bad address) is 'refused'; a Microsoft outage (503) is 'other'", async () => {
    const bad = fakeMicrosoft([token(), failed(400, "ErrorInvalidRecipients", "invalid recipient")]);
    expect((await failure(() => createGraphMailer(SETTINGS, { fetch: bad.fetch }).send(EMAIL))).kind).toBe("refused");
    const down = fakeMicrosoft([token(), new Response("busy", { status: 503 })]);
    expect((await failure(() => createGraphMailer(SETTINGS, { fetch: down.fetch }).send(EMAIL))).kind).toBe("other");
  });

  it("no network, or no answer in time, is a connection failure", async () => {
    const offline = fakeMicrosoft([new TypeError("fetch failed")]);
    expect((await failure(() => createGraphMailer(SETTINGS, { fetch: offline.fetch }).send(EMAIL))).kind).toBe("connect");
    const slow = async (_url: string, init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    const error = await failure(() => createGraphMailer(SETTINGS, { fetch: slow, limits: { requestMs: 50 } }).send(EMAIL));
    expect(error).toMatchObject({ kind: "connect", reply: "no answer within 0.05 s" });
  });
});

describe("EMAIL_MODE=graph settings", () => {
  const base = { EMAIL_MODE: "graph", GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: SECRET, EMAIL_FROM: "Q1st <notifications@quantum1st.com>" };

  it("reads the four settings, with the sender's name and address apart", () => {
    expect(parseServicesEnv(base).graph).toEqual({ tenantId: "t", clientId: "c", clientSecret: SECRET, fromName: "Q1st", fromAddress: "notifications@quantum1st.com" });
    expect(mailerFor(parseServicesEnv(base))).toBeDefined();
  });

  it("names what is missing, and never repeats the secret", () => {
    expect(() => parseServicesEnv({ ...base, GRAPH_CLIENT_ID: "", EMAIL_FROM: "" })).toThrow("EMAIL_MODE=graph needs GRAPH_CLIENT_ID, EMAIL_FROM.");
    let message = "";
    try {
      parseServicesEnv({ ...base, EMAIL_FROM: "two@a.com, three@b.com" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/EMAIL_FROM must be one address/);
    expect(message).not.toContain(SECRET);
  });
});

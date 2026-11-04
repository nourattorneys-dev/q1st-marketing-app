import { createTranslator, type AbstractIntlMessages } from "next-intl";
import ar from "../../../messages/ar.json";
import en from "../../../messages/en.json";
import type { Role } from "@/lib/auth/roles";
import { settingsPageFor } from "@/lib/dashboard/connections";
import { formatNumber } from "@/lib/format/number";
import type { Batch } from "./batches";

const LOCALES = ["en", "ar"] as const;
type Locale = (typeof LOCALES)[number];
const MESSAGES: Record<Locale, AbstractIntlMessages> = { en, ar };

/** A translator with plain string keys: the keys here are built from engine data (statuses, metrics), checked with has(). */
type Translate = ((key: string, values?: Record<string, string | number>) => string) & { has(key: string): boolean };
const translator = (locale: Locale, namespace: string) => createTranslator({ locale, messages: MESSAGES[locale], namespace }) as unknown as Translate;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Text from the engine (statuses, metric names) goes into HTML escaped (Review Focus 4). */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const textOf = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

/** The last item per key: a connection or metric reported twice in a batch shows once, in its latest state. */
function latestBy(items: Batch["items"], key: (data: Record<string, unknown>) => string): Record<string, unknown>[] {
  const latest = new Map<string, Record<string, unknown>>();
  for (const item of items) latest.set(key(item.data), item.data);
  return [...latest.values()];
}

type Line = { text: string; path: string };

function linesFor(batch: Batch, locale: Locale): Line[] {
  const t = translator(locale, "Email");
  const tConnections = translator(locale, "Dashboard.connections");
  const tMetrics = translator(locale, "Dashboard.quota.metrics");
  const ofKind = (kind: string) => batch.items.filter((item) => item.kind === kind);
  const counted = (key: string, count: number) => t(key, { count, n: String(count) });
  const metricName = (data: Record<string, unknown>) => {
    const metric = textOf(data.metric);
    return tMetrics.has(metric) ? tMetrics(metric) : metric;
  };
  const amount = (value: unknown) => formatNumber(Number(value) || 0, locale);
  const lines: Line[] = [];

  const drafted = ofKind("drafted").length;
  if (drafted > 0) lines.push({ text: counted("drafted", drafted), path: "/review" });
  const failed = ofKind("failed").length;
  if (failed > 0) lines.push({ text: counted("failed", failed), path: "/history" });
  for (const data of latestBy(ofKind("connection"), (d) => textOf(d.type))) {
    const type = textOf(data.type);
    const status = textOf(data.status);
    lines.push({
      text: t("connection", {
        name: tConnections.has(`names.${type}`) ? tConnections(`names.${type}`) : type,
        status: tConnections.has(`statuses.${status}`) ? tConnections(`statuses.${status}`) : status,
      }),
      path: settingsPageFor(type),
    });
  }
  for (const data of latestBy(ofKind("quotaWarning"), (d) => textOf(d.metric))) {
    lines.push({ text: t("quotaWarning", { metric: metricName(data), used: amount(data.used), limit: amount(data.limit) }), path: "/plan" });
  }
  for (const data of latestBy(ofKind("quotaExceeded"), (d) => textOf(d.metric))) {
    lines.push({ text: t("quotaExceeded", { metric: metricName(data), limit: amount(data.limit) }), path: "/plan" });
  }
  const lastScan = ofKind("scan").at(-1);
  if (lastScan) lines.push({ text: counted("scan", Number(lastScan.data.findings) || 0), path: "/site-health" });
  return lines;
}

/** One language's half of an email: a title, optional rows (each may link), one main button, and a note. */
type Part = {
  locale: Locale;
  subject: string;
  heading: string;
  lines: { text: string; href: string | null }[];
  button?: { text: string; href: string } | null;
  footer: string;
  settings: string | null;
};

/**
 * Whose email this is: the client's name, main colour, logo (an https address mail apps can load) and address.
 * Null: Qalam's own look (an email with no client yet, such as a password reset).
 */
export type EmailBrand = { name: string; color: string | null; logoUrl: string | null; origin: string | null };

const INK = "#07090f";
const QALAM_BLUE = "#2f6bff";
const PAGE = "#f4f2ee";
const LINE = "#e6e2da";
const MUTED = "#6b7280";
const TEXT = "#1f2937";

/** Black or white text on a colour, whichever reads better (the client's colour can be light or dark). */
function textOn(hex: string): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? INK : "#ffffff";
}

const FONT = { en: "Arial,Helvetica,sans-serif", ar: "Tahoma,'Segoe UI',Arial,sans-serif" } as const;

/**
 * Design §10: one email, English then Arabic (right to left), as HTML and as plain text. Tables and inline styles only,
 * so Outlook, Gmail and Apple Mail show it the same way; the client's colour heads it and colours its button.
 */
function compose(parts: Part[], brand: EmailBrand | null = null, assetOrigin: string | null = null): { subject: string; html: string; text: string } {
  const accent = brand?.color ?? QALAM_BLUE;
  const head = brand?.color ?? INK;
  const onHead = textOn(head);
  const onAccent = textOn(accent);
  const mark = assetOrigin ? `${assetOrigin}/email/qalam-mark.png` : null;
  const e = escapeHtml;

  const header = brand?.logoUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;border-radius:10px;padding:8px 12px"><img src="${e(brand.logoUrl)}" alt="${e(brand.name)}" height="40" style="display:block;height:40px;max-width:220px;border:0"></td></tr></table>`
    : `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${mark && !brand ? `<td style="padding-right:10px"><img src="${e(mark)}" alt="" width="32" height="32" style="display:block;border:0;border-radius:8px"></td>` : ""}<td style="font-family:${FONT.en};font-size:20px;font-weight:bold;color:${onHead}">${e(brand?.name ?? "qalam")}</td></tr></table>`;

  const section = (part: Part) => {
    const rtl = part.locale === "ar";
    const align = rtl ? "right" : "left";
    const font = FONT[part.locale];
    const rows = part.lines
      .map(
        (line) =>
          `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${font};font-size:15px;line-height:1.5;color:${TEXT};text-align:${align}">` +
          (line.href ? `<a href="${e(line.href)}" style="color:${TEXT};text-decoration:none">${e(line.text)} <span style="color:${accent}">${rtl ? "&larr;" : "&rarr;"}</span></a>` : e(line.text)) +
          `</td></tr>`,
      )
      .join("");
    const button = part.button
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px" align="${align}"><tr><td style="background:${accent};border-radius:10px">` +
        `<a href="${e(part.button.href)}" style="display:inline-block;padding:12px 22px;font-family:${font};font-size:15px;font-weight:bold;color:${onAccent};text-decoration:none">${e(part.button.text)}</a></td></tr></table>` +
        `<div style="clear:both;font-family:${font};font-size:12px;color:${MUTED};text-align:${align};padding-top:6px">${e(part.button.href)}</div>`
      : "";
    const note = part.settings
      ? `<a href="${e(part.settings)}" style="color:${MUTED}">${e(part.footer)}</a>`
      : e(part.footer);
    return (
      `<tr><td dir="${rtl ? "rtl" : "ltr"}" lang="${part.locale}" style="padding:28px 32px;text-align:${align}">` +
      `<div style="font-family:${font};font-size:20px;line-height:1.35;font-weight:bold;color:${INK};margin:0 0 12px">${e(part.heading)}</div>` +
      (rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>` : "") +
      button +
      `<div style="font-family:${font};font-size:13px;line-height:1.5;color:${MUTED};margin-top:18px">${note}</div>` +
      `</td></tr>`
    );
  };

  const site = brand?.origin ? brand.origin.replace(/^https?:\/\//, "") : null;
  const html = [
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>`,
    `<body style="margin:0;padding:0;background:${PAGE}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}"><tr><td align="center" style="padding:24px 12px">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${LINE}">`,
    `<tr><td style="background:${head};padding:20px 32px">${header}</td></tr>`,
    parts.map(section).join(`<tr><td style="padding:0 32px"><div style="border-top:1px solid ${LINE};height:1px;line-height:1px">&nbsp;</div></td></tr>`),
    `</table>`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px"><tr><td align="center" style="padding:18px 12px;font-family:${FONT.en};font-size:12px;line-height:1.6;color:${MUTED}">`,
    `${mark ? `<img src="${e(mark)}" alt="" width="18" height="18" style="vertical-align:middle;border:0;border-radius:5px"> ` : ""}Qalam by Quantum1st${site ? ` &middot; <a href="${e(brand!.origin!)}" style="color:${MUTED}">${e(site)}</a>` : ""}`,
    `</td></tr></table>`,
    `</td></tr></table></body></html>`,
  ].join("");
  const text = parts
    .map((part) =>
      [
        part.heading,
        "",
        ...part.lines.map((line) => `- ${line.text}${line.href ? `: ${line.href}` : ""}`),
        ...(part.button ? ["", `${part.button.text}: ${part.button.href}`] : []),
        "",
        `${part.footer}${part.settings ? ` ${part.settings}` : ""}`,
      ].join("\n"),
    )
    .join("\n\n———\n\n");
  return { subject: parts.map((part) => part.subject).join(" · "), html, text };
}

/** Design §10: one email per batch, linking to both languages of the dashboard. */
export function renderBatch(batch: Batch, origin: string | null, brand: EmailBrand | null = null): { subject: string; html: string; text: string } {
  return compose(
    LOCALES.map((locale) => {
      const t = translator(locale, "Email");
      const href = (path: string) => (origin ? `${origin}/${locale}${path}` : null);
      const lines = linesFor(batch, locale).map((line) => ({ text: line.text, href: href(line.path) }));
      const count = batch.audience === "reviewers" ? batch.items.length : lines.length;
      return {
        locale,
        subject: t(`subject.${batch.audience}`, { count, n: String(count) }),
        heading: t(`heading.${batch.audience}`),
        lines,
        button: origin ? { text: t(`button.${batch.audience}`), href: `${origin}/${locale}${batch.audience === "reviewers" ? "/review" : ""}` } : null,
        footer: t("footer"),
        settings: href("/notifications"),
      };
    }),
    brand,
    origin,
  );
}

/** M5b: an Admin's test email, in the notification emails' format, so it shows how those arrive. */
export function renderTestEmail(brand: EmailBrand | null = null, origin: string | null = null): { subject: string; html: string; text: string } {
  return compose(
    LOCALES.map((locale) => {
      const t = translator(locale, "Email.test");
      return {
        locale,
        subject: t("subject"),
        heading: t("heading"),
        lines: [{ text: t("body"), href: null }],
        button: origin ? { text: t("button"), href: `${origin}/${locale}/notifications` } : null,
        footer: t("footer"),
        settings: null,
      };
    }),
    brand,
    origin,
  );
}

/**
 * M5c: an invitation or a password-reset email, in the notification format. Each language's half links to that
 * language's page; the links come from APP_URL only, never from a request.
 */
/**
 * `added`: someone who already has an account was given a place in another client; the link opens that client (no
 * token: they sign in with the password they have).
 */
export function renderAccountEmail(
  kind: "invitation" | "reset" | "added",
  input: { appUrl: string; token?: string; role?: Role; client?: string; brand?: EmailBrand | null },
): { subject: string; html: string; text: string } {
  const path = kind === "invitation" ? "invitation" : kind === "reset" ? "reset-password" : "";
  return compose(
    LOCALES.map((locale) => {
      const t = translator(locale, `Email.${kind}`);
      const role = input.role ? translator(locale, "Shell.role")(input.role) : "";
      const href = input.token ? `${input.appUrl}/${locale}/${path}?token=${encodeURIComponent(input.token)}` : `${input.appUrl}/${locale}`;
      const values = { role, client: input.client || "none" };
      return { locale, subject: t("subject", values), heading: t("heading", values), lines: [], button: { text: t("link", values), href }, footer: t("footer"), settings: null };
    }),
    input.brand ?? null,
    input.appUrl,
  );
}

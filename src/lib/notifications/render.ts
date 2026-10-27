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

/** One language's half of an email. */
type Part = {
  locale: Locale;
  subject: string;
  heading: string;
  lines: { text: string; href: string | null }[];
  footer: string;
  settings: string | null;
};

/** Design §10: one email, English then Arabic (right to left), as HTML and as plain text. */
function compose(parts: Part[]): { subject: string; html: string; text: string } {
  const link = (text: string, href: string | null, style = "") => (href ? `<a href="${escapeHtml(href)}"${style}>${escapeHtml(text)}</a>` : escapeHtml(text));
  const html = [
    '<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">',
    parts
      .map(
        (part) =>
          `<div dir="${part.locale === "ar" ? "rtl" : "ltr"}" lang="${part.locale}" style="margin-bottom:24px">` +
          `<p><strong>${escapeHtml(part.heading)}</strong></p>` +
          `<ul>${part.lines.map((line) => `<li>${link(line.text, line.href)}</li>`).join("")}</ul>` +
          `<p style="color:#6b7280;font-size:13px">${link(part.footer, part.settings, ' style="color:#6b7280"')}</p></div>`,
      )
      .join('<hr style="border:none;border-top:1px solid #e5e7eb">'),
    "</body></html>",
  ].join("");
  const text = parts
    .map((part) =>
      [part.heading, "", ...part.lines.map((line) => `- ${line.text}${line.href ? `: ${line.href}` : ""}`), "", `${part.footer}${part.settings ? ` ${part.settings}` : ""}`].join("\n"),
    )
    .join("\n\n———\n\n");
  return { subject: parts.map((part) => part.subject).join(" · "), html, text };
}

/** Design §10: one email per batch, linking to both languages of the dashboard. */
export function renderBatch(batch: Batch, origin: string | null): { subject: string; html: string; text: string } {
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
        footer: t("footer"),
        settings: href("/notifications"),
      };
    }),
  );
}

/** M5b: an Admin's test email, in the notification emails' format, so it shows how those arrive. */
export function renderTestEmail(): { subject: string; html: string; text: string } {
  return compose(
    LOCALES.map((locale) => {
      const t = translator(locale, "Email.test");
      return { locale, subject: t("subject"), heading: t("heading"), lines: [{ text: t("body"), href: null }], footer: t("footer"), settings: null };
    }),
  );
}

/**
 * M5c: an invitation or a password-reset email, in the notification format. Each language's half links to that
 * language's page; the links come from APP_URL only, never from a request.
 */
export function renderAccountEmail(kind: "invitation" | "reset", input: { appUrl: string; token: string; role?: Role }): { subject: string; html: string; text: string } {
  const path = kind === "invitation" ? "invitation" : "reset-password";
  return compose(
    LOCALES.map((locale) => {
      const t = translator(locale, `Email.${kind}`);
      const role = input.role ? translator(locale, "Shell.role")(input.role) : "";
      const href = `${input.appUrl}/${locale}/${path}?token=${encodeURIComponent(input.token)}`;
      return { locale, subject: t("subject"), heading: t("heading", { role }), lines: [{ text: t("link"), href }], footer: t("footer"), settings: null };
    }),
  );
}

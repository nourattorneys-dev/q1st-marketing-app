/**
 * P2: a client's main colour becomes the app's action colour (buttons, links, the chosen page in the list, focus rings)
 * for that client's people. Text on it is white or ink, whichever reads better; in dark mode links and rings use a
 * lighter mix so they stay readable. Only a #rrggbb colour is ever written into the page.
 */
const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** White or ink (#0a0f1c) on this colour: whichever has more contrast. */
export function textOn(hex: string): "#ffffff" | "#0a0f1c" {
  const l = luminance(hex);
  return contrast(l, 1) >= contrast(l, luminance("#0a0f1c")) ? "#ffffff" : "#0a0f1c";
}

export function brandCss(color: string | null): string | null {
  if (!color || !HEX.test(color)) return null;
  const c = color.toLowerCase();
  const on = textOn(c);
  const light = (pct: number) => `color-mix(in srgb,${c} ${pct}%,#ffffff)`;
  const ink = (pct: number) => `color-mix(in srgb,${c} ${pct}%,#0a0f1c)`;
  const night = (pct: number) => `color-mix(in srgb,${c} ${pct}%,#07090f)`;
  return [
    `:root{--primary:${c};--primary-foreground:${on};--ring:${c};--link:${ink(85)};--accent:${light(12)};--accent-foreground:${ink(80)};`,
    `--sidebar-primary:${c};--sidebar-primary-foreground:${on};--sidebar-accent:${light(12)};--sidebar-accent-foreground:${ink(80)};`,
    `--sidebar-ring:${c};--chart-1:${c};}`,
    `[data-theme="dark"]{--ring:${light(60)};--link:${light(55)};--accent:${night(22)};--accent-foreground:${light(55)};`,
    `--sidebar-accent:${night(22)};--sidebar-accent-foreground:${light(55)};--sidebar-ring:${light(60)};--chart-1:${light(60)};}`,
  ].join("");
}

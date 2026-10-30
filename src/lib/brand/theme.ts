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

/**
 * `color` for light mode; `colorDark` for dark mode (a client's dark-mode colour). With no dark colour, dark mode uses the
 * light one, lightened where it is text on the dark ground. Either alone is fine; neither writes nothing.
 */
export function brandCss(color: string | null, colorDark: string | null = null): string | null {
  const day = color && HEX.test(color) ? color.toLowerCase() : null;
  const night = colorDark && HEX.test(colorDark) ? colorDark.toLowerCase() : null;
  if (!day && !night) return null;
  const parts: string[] = [];
  if (day) {
    const light = (pct: number) => `color-mix(in srgb,${day} ${pct}%,#ffffff)`;
    const ink = (pct: number) => `color-mix(in srgb,${day} ${pct}%,#0a0f1c)`;
    parts.push(
      `:root{--primary:${day};--primary-foreground:${textOn(day)};--ring:${day};--link:${ink(85)};--accent:${light(12)};--accent-foreground:${ink(80)};`,
      `--sidebar-primary:${day};--sidebar-primary-foreground:${textOn(day)};--sidebar-accent:${light(12)};--sidebar-accent-foreground:${ink(80)};`,
      `--sidebar-ring:${day};--chart-1:${day};}`,
    );
  }
  const d = night ?? day!;
  const lift = (pct: number) => (night ? `color-mix(in srgb,${d} ${Math.max(pct, 85)}%,#ffffff)` : `color-mix(in srgb,${d} ${pct}%,#ffffff)`);
  const dim = (pct: number) => `color-mix(in srgb,${d} ${pct}%,#07090f)`;
  parts.push(
    `[data-theme="dark"]{--primary:${d};--primary-foreground:${textOn(d)};--sidebar-primary:${d};--sidebar-primary-foreground:${textOn(d)};`,
    `--ring:${lift(60)};--link:${lift(55)};--accent:${dim(22)};--accent-foreground:${lift(55)};`,
    `--sidebar-accent:${dim(22)};--sidebar-accent-foreground:${lift(55)};--sidebar-ring:${lift(60)};--chart-1:${lift(60)};}`,
  );
  return parts.join("");
}

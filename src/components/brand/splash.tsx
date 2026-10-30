import { getTranslations } from "next-intl/server";
import { ByQuantum1st } from "./qalam-mark";

const RING = "52,30 45.6,14.4 30,8 14.4,14.4 8,30 14.4,45.6 30,52";
const NODES: [number, number][] = [
  [52, 30],
  [45.6, 14.4],
  [30, 8],
  [14.4, 14.4],
  [8, 30],
  [14.4, 45.6],
  [30, 52],
];

/**
 * P2: the Qalam mark draws itself once when someone opens the app: the nodes appear one by one, the ring joins them,
 * the signal runs down to the nib and the gold ink point lands; then the screen fades into the page. Pure CSS (it plays
 * before the page's scripts load), skipped on later pages of the same visit, and not animated for people whose device
 * asks for less motion. It never blocks: the page underneath is already there. Its timing (once per visit, fade, then
 * gone) is set by the layout's first script, which runs before the page streams in.
 */
export async function Splash() {
  const t = await getTranslations("Shell");
  return (
    <div className="qalam-splash" aria-hidden="true">
      <div className="flex flex-col items-center gap-6">
        <svg
          width="120"
          height="120"
          viewBox="0 0 64 64"
          style={{ direction: "ltr" }}
        >
          <polyline
            className="qs-ring"
            points={RING}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          {NODES.map(([cx, cy], index) => (
            <circle
              key={`${cx}-${cy}`}
              className="qs-node"
              style={{ animationDelay: `${0.12 + index * 0.1}s` }}
              cx={cx}
              cy={cy}
              r="3.4"
              fill="currentColor"
            />
          ))}
          <line
            className="qs-tail"
            x1="30"
            y1="30"
            x2="41"
            y2="41"
            stroke="#2F6BFF"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <g transform="translate(43 43) rotate(45)">
            <path
              className="qs-nib"
              d="M-3,-5.5 L13,0 L-3,5.5 Q-6,0 -3,-5.5 Z"
              fill="#2F6BFF"
            />
          </g>
          <circle
            className="qs-node"
            style={{ animationDelay: "0.85s" }}
            cx="30"
            cy="30"
            r="4.2"
            fill="#2F6BFF"
          />
          <circle
            className="qs-pulse"
            cx="57.5"
            cy="57.5"
            r="3.2"
            fill="var(--brand-gold)"
          />
          <circle
            className="qs-ink"
            cx="57.5"
            cy="57.5"
            r="3.2"
            fill="var(--brand-gold)"
          />
        </svg>
        <div className="qs-word flex flex-col items-center gap-1.5">
          <span className="text-3xl font-semibold tracking-[-0.05em]" dir="ltr">
            qalam
          </span>
          <ByQuantum1st className="font-mono text-xs text-muted-foreground" />
        </div>
        <span className="sr-only">{t("loading_brand")}</span>
      </div>
    </div>
  );
}

/**
 * The Quantum1st mark ("Node Q", brand guide): seven nodes on a circle form the Q; the blue core sends a signal through
 * the tail to the gold node. Colours come from the theme (ink line, Signal Blue core, gold signal), never restyled.
 * Below 48px the guide's simplified mark is used: thicker strokes, four nodes.
 */
const RING = "52,30 45.6,14.4 30,8 14.4,14.4 8,30 14.4,45.6 30,52";
const NODES: [number, number][] = [
  [52, 30], [45.6, 14.4], [30, 8], [14.4, 14.4], [8, 30], [14.4, 45.6], [30, 52],
];
const FEW: [number, number][] = [[52, 30], [30, 8], [8, 30], [30, 52]];

export function NodeQ({ size = 32, className }: { size?: number; className?: string }) {
  const small = size < 48;
  const nodes = small ? FEW : NODES;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className} style={{ direction: "ltr" }}>
      <polyline points={RING} fill="none" stroke="currentColor" strokeWidth={small ? 3.2 : 2.4} strokeLinejoin="round" />
      <line x1="30" y1="30" x2="56" y2="56" stroke="#2F6BFF" strokeWidth={small ? 4 : 3} strokeLinecap="round" />
      {nodes.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={small ? 3.8 : 3.4} fill="currentColor" />
      ))}
      <circle cx="30" cy="30" r={small ? 5 : 4.2} fill="#2F6BFF" />
      <circle cx="56" cy="56" r={small ? 6 : 5} fill="var(--brand-gold)" />
    </svg>
  );
}

/** Gold is for the "1st" (brand colour rule); the rest of the name stays ink. */
function withGoldFirst(name: string) {
  const at = name.indexOf("1st");
  if (at < 0) return name;
  return (
    <>
      {name.slice(0, at)}
      <span className="text-brand-gold">1st</span>
      {name.slice(at + 3)}
    </>
  );
}

/** The product lockup: the mark, the product name, and "by Quantum1st" under it (brand architecture). Always left-to-right. */
export function ProductMark({ name, byline }: { name: string; byline: string }) {
  return (
    <div className="flex items-center gap-2.5" dir="ltr">
      <NodeQ size={34} className="shrink-0 text-foreground" />
      <div className="flex flex-col leading-tight">
        <span className="text-[17px] font-semibold tracking-[-0.03em]">{withGoldFirst(name)}</span>
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">{byline}</span>
      </div>
    </div>
  );
}

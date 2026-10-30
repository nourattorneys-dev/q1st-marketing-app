/**
 * The Qalam mark (product brand, option A): the Quantum1st Node Q, whose tail ends in a pen nib with a gold ink point.
 * Ring and nodes take the text colour; nib and core are Signal Blue; the ink point is the theme's gold. Below 48px the
 * small form is used (four nodes, plain nib), as the brand guide asks for Node Q. Never mirrored in Arabic.
 */
const RING = "52,30 45.6,14.4 30,8 14.4,14.4 8,30 14.4,45.6 30,52";
const ALL: [number, number][] = [
  [52, 30], [45.6, 14.4], [30, 8], [14.4, 14.4], [8, 30], [14.4, 45.6], [30, 52],
];
const FEW: [number, number][] = [[52, 30], [30, 8], [8, 30], [30, 52]];
const BLUE = "#2F6BFF";

export function QalamMark({ size = 32, className }: { size?: number; className?: string }) {
  const small = size < 48;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className} style={{ direction: "ltr" }}>
      <polyline points={RING} fill="none" stroke="currentColor" strokeWidth={small ? 3.6 : 2.4} strokeLinejoin="round" />
      {(small ? FEW : ALL).map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={small ? 3.9 : 3.4} fill="currentColor" />
      ))}
      <line x1="30" y1="30" x2="41" y2="41" stroke={BLUE} strokeWidth={small ? 4 : 3} strokeLinecap="round" />
      <g transform="translate(43 43) rotate(45)">
        <path d={small ? "M-3,-6 L14,0 L-3,6 Q-6,0 -3,-6 Z" : "M-3,-5.5 L13,0 L-3,5.5 Q-6,0 -3,-5.5 Z"} fill={BLUE} />
        {small ? null : (
          <>
            <line x1="1" y1="0" x2="12" y2="0" stroke="var(--card)" strokeWidth="1.1" strokeLinecap="round" />
            <circle cx="1" cy="0" r="1.5" fill="var(--card)" />
          </>
        )}
      </g>
      <circle cx="30" cy="30" r={small ? 5 : 4.2} fill={BLUE} />
      <circle cx="57.5" cy="57.5" r={small ? 3.6 : 3.2} fill="var(--brand-gold)" />
    </svg>
  );
}

/** The endorsement line: "by quantum1st", with the gold "1st" of the parent brand. */
export function ByQuantum1st({ className }: { className?: string }) {
  return (
    <span className={className} dir="ltr">
      by quantum<span className="text-brand-gold">1st</span>
    </span>
  );
}

/** The product lockup: the mark, "qalam" (or "قلم" in Arabic), and "by quantum1st" under it. */
export function ProductMark({ name }: { name: string }) {
  const arabic = /[؀-ۿ]/.test(name);
  return (
    <div className="flex items-center gap-2.5" dir="ltr">
      <QalamMark size={36} className="shrink-0 text-foreground" />
      <div className="flex flex-col leading-none">
        <span
          className={arabic ? "font-sans text-[22px] font-bold" : "text-[22px] font-semibold tracking-[-0.05em]"}
          dir={arabic ? "rtl" : "ltr"}
        >
          {arabic ? name : name.toLowerCase()}
        </span>
        <ByQuantum1st className="mt-1 font-mono text-[11px] text-muted-foreground" />
      </div>
    </div>
  );
}

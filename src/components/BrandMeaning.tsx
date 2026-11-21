/** What the name REVLINE stands for. The initials spell R-E-V-L-I-N-E. */
export const REVLINE_WORDS = ['Responsive', 'Electric', 'Vehicle', 'Live', 'Immersive', 'Natural', 'Experience'] as const;

/** The seven words with their initial letter highlighted (the backronym of REVLINE). */
export function BrandMeaning({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-meaning ${className}`.trim()} aria-label={REVLINE_WORDS.join(' ')}>
      {REVLINE_WORDS.map((w) => (
        <span key={w} className="bm-word" aria-hidden="true"><b>{w[0]}</b>{w.slice(1)}</span>
      ))}
    </span>
  );
}

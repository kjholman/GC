/**
 * Placeholder wordmark built from the firm name. Replace with the official
 * Genesys Capital logo (drop an SVG at /public/brand/logo.svg and swap the
 * markup below) once brand assets are supplied.
 */
export function Logo({ tone = "light", compact = false }: { tone?: "light" | "dark"; compact?: boolean }) {
  const ink = tone === "light" ? "#ffffff" : "var(--color-navy-900)";
  return (
    <div className="flex items-center gap-3 select-none">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <rect x="0.5" y="0.5" width="33" height="33" fill="none" stroke="var(--color-gold-500)" />
        <path
          d="M23.5 11.2A8 8 0 1 0 25 17h-7.5"
          fill="none"
          stroke={ink}
          strokeWidth="2"
          strokeLinecap="square"
        />
        <circle cx="25" cy="17" r="1.6" fill="var(--color-gold-500)" />
      </svg>
      {!compact && (
        <div className="leading-none">
          <div className="font-serif text-[17px] tracking-[0.2em]" style={{ color: ink }}>
            GENESYS
          </div>
          <div className="mt-1 text-[9.5px] font-semibold tracking-[0.34em] text-gold-500">CAPITAL</div>
        </div>
      )}
    </div>
  );
}

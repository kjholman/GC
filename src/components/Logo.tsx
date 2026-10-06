import { useId } from "react";

/**
 * Genesys Capital logo: the interlocking G/C hexagon mark (vector reconstruction
 * of the mark on genesyscapital.com, with its navy → teal → green gradient) and
 * the Poppins wordmark.
 */

const POLYGONS = [
  "86,41 253,13 362,141 298,155 230,82 125,100 89,205 157,286 318,258 307,325 129,347 18,210",
  "221,141 316,254 250,270 196,206",
  "326,249 432,381 374,397 304,316",
  "133,353 207,350 173,446 244,530 337,513 383,565 219,595 103,445",
];

export function GenesysMark({ size = 40, solid, className }: { size?: number; solid?: string; className?: string }) {
  // Unique per instance: a gradient defined inside a hidden copy (e.g. the mobile header) would otherwise blank every other copy.
  const uid = useId().replace(/:/g, "");
  const id = solid ? undefined : `gc-mark-${uid}`;
  const paint = solid ?? `url(#${id})`;
  return (
    <svg viewBox="0 0 440 620" height={size} width={(size * 440) / 620} className={className} aria-hidden="true">
      {id && (
        <defs>
          <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="20" y1="120" x2="440" y2="470">
            <stop offset="0" stopColor="#1A576F" />
            <stop offset="0.5" stopColor="#29A2B5" />
            <stop offset="1" stopColor="#17B1A7" />
          </linearGradient>
        </defs>
      )}
      <g fill={paint} stroke={paint} strokeWidth="16" strokeLinejoin="round">
        {POLYGONS.map((p) => (
          <polygon key={p} points={p} />
        ))}
      </g>
    </svg>
  );
}

/** `on` is the background the logo sits on: white wordmark on dark, navy on light. */
export function Logo({ on = "light", size = "md", compact = false }: { on?: "light" | "dark"; size?: "sm" | "md" | "lg"; compact?: boolean }) {
  const scale = { sm: 0.8, md: 1, lg: 1.6 }[size];
  const ink = on === "dark" ? "#ffffff" : "#182e3c";
  return (
    <div className="flex select-none items-center" style={{ gap: 8 * scale }} aria-label="Genesys Capital">
      <GenesysMark size={44 * scale} />
      {!compact && (
        <div className="font-sans leading-none" style={{ color: ink }}>
          <div style={{ fontSize: 25 * scale, fontWeight: 600, letterSpacing: "-0.01em" }}>Genesys</div>
          <div style={{ fontSize: 17 * scale, fontWeight: 400, marginTop: 1 * scale, paddingLeft: 3 * scale }}>Capital</div>
        </div>
      )}
    </div>
  );
}

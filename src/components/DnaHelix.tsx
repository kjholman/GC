/**
 * Decorative DNA double helix with drifting particles, echoing the hero imagery
 * on genesyscapital.com. Pure SVG, deterministic (no client JS).
 */
// Deterministic pseudo-random particles (computed once at module load).
const PARTICLES = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: 90 }, () => ({ x: rnd(), y: rnd(), r: 1 + rnd() * 6, o: 0.15 + rnd() * 0.5, ring: rnd() > 0.6 }));
})();

export function DnaHelix({ className }: { className?: string }) {
  const W = 1400;
  const H = 700;
  const turns = 2.6;
  const N = 140;
  const strand = (phase: number) =>
    Array.from({ length: N + 1 }, (_, i) => {
      const t = i / N;
      const x = t * W;
      const y = H * 0.48 + Math.sin(t * Math.PI * 2 * turns + phase) * 150 - t * 120;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  const rungs = Array.from({ length: 70 }, (_, i) => {
    const t = (i + 0.5) / 70;
    const x = t * W;
    const base = H * 0.48 - t * 120;
    const a = Math.sin(t * Math.PI * 2 * turns);
    return { x, y1: base + a * 150, y2: base - a * 150, depth: Math.abs(Math.cos(t * Math.PI * 2 * turns)) };
  });
  const particles = PARTICLES.map((p) => ({ ...p, x: p.x * W, y: p.y * H }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="dna-glow" cx="0.55" cy="0.45" r="0.7">
          <stop offset="0" stopColor="#0f4a57" stopOpacity="0.9" />
          <stop offset="1" stopColor="#041d2a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dna-strand" x1="0" x2="1">
          <stop offset="0" stopColor="#1a576f" />
          <stop offset="0.5" stopColor="#29a2b5" />
          <stop offset="1" stopColor="#17b1a7" />
        </linearGradient>
        <filter id="dna-blur"><feGaussianBlur stdDeviation="2.2" /></filter>
        <filter id="dna-soft"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <rect width={W} height={H} fill="#041d2a" />
      <rect width={W} height={H} fill="url(#dna-glow)" />
      <g opacity="0.75">
        {rungs.map((r, i) => (
          <line key={i} x1={r.x} y1={r.y1} x2={r.x} y2={r.y2} stroke="#29a2b5" strokeOpacity={0.12 + r.depth * 0.25} strokeWidth="2" />
        ))}
      </g>
      <g fill="none" strokeLinecap="round">
        <path d={strand(0)} stroke="url(#dna-strand)" strokeWidth="26" opacity="0.18" filter="url(#dna-soft)" />
        <path d={strand(Math.PI)} stroke="url(#dna-strand)" strokeWidth="26" opacity="0.14" filter="url(#dna-soft)" />
        <path d={strand(0)} stroke="url(#dna-strand)" strokeWidth="5" opacity="0.8" filter="url(#dna-blur)" />
        <path d={strand(Math.PI)} stroke="url(#dna-strand)" strokeWidth="5" opacity="0.6" filter="url(#dna-blur)" />
      </g>
      <g>
        {particles.map((p, i) =>
          p.ring ? (
            <circle key={i} cx={p.x} cy={p.y} r={p.r + 3} fill="none" stroke="#29a2b5" strokeOpacity={p.o * 0.8} strokeWidth="1.5" />
          ) : (
            <circle key={i} cx={p.x} cy={p.y} r={p.r * 0.6} fill={i % 7 === 0 ? "#ffffff" : "#17b1a7"} fillOpacity={p.o} />
          ),
        )}
      </g>
    </svg>
  );
}

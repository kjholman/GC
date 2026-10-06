import { useId } from "react";
import { cx } from "./ui";

/**
 * Life-sciences in-jokes starring Paras's face (public/brand/sharminator-face.png).
 * Internal screens only: never in founder correspondence or memos.
 */
const FACE = "/brand/sharminator-face.png";
const FACE_RATIO = 275 / 203; // cut-out height / width (full head, hair included)
/** Scenes were laid out for a taller cut-out; keep the chin where they expect it. */
const LAYOUT_RATIO = 331 / 220;

export type Scene = "mice" | "blot" | "pvalue" | "slide31" | "runway" | "petri" | "retracted" | "deck";

const IMPACT = { fontFamily: "Impact, Anton, 'Arial Black', sans-serif", fontWeight: 900 } as const;
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" } as const;

/**
 * The cut-out ends at the chin, so a neck is drawn behind it that runs down
 * into the collar. Scenes draw the lab coat after the face, so the collar
 * overlaps the neck and the head sits on the body instead of floating.
 */
function Face({ x, y, w, filter, neck = true }: { x: number; y: number; w: number; filter?: string; neck?: boolean }) {
  const chin = y + w * 1.44;
  const nx = x + w * 0.47;
  const nw = w * 0.36;
  return (
    <g filter={filter}>
      {neck && (
        <>
          <path d={`M${nx - nw / 2} ${chin - w * 0.16} L${nx - nw / 2 - w * 0.02} ${chin + w * 0.62} L${nx + nw / 2 + w * 0.02} ${chin + w * 0.62} L${nx + nw / 2} ${chin - w * 0.16} Z`} fill="#94705e" />
          <ellipse cx={nx} cy={chin + w * 0.02} rx={nw / 2} ry={w * 0.06} fill="#6f5243" opacity="0.55" />
        </>
      )}
      <image href={FACE} x={x} y={y + w * (LAYOUT_RATIO - FACE_RATIO)} width={w} height={w * FACE_RATIO} preserveAspectRatio="xMidYMid meet" />
    </g>
  );
}

/** Splits a caption into at most two balanced lines that fit the 300px frame. */
function lines(text: string, size: number): { rows: string[]; size: number } {
  const t = text.toUpperCase();
  const fits = (str: string, sz: number) => str.length * sz * 0.64 <= 272;
  if (fits(t, size)) return { rows: [t], size };
  const words = t.split(" ");
  let best = [t, ""];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
  }
  const longest = Math.max(...best.map((r) => r.length));
  return { rows: best.filter(Boolean), size: Math.min(size, 272 / (longest * 0.64)) };
}

function Caption({ top, bottom, size = 21 }: { top?: string; bottom?: string; size?: number }) {
  const style = (sz: number) => ({ ...IMPACT, fontSize: sz, fill: "#fff", stroke: "#000", strokeWidth: 3.2, paintOrder: "stroke" as const, textAnchor: "middle" as const });
  const t = top ? lines(top, size) : null;
  const b = bottom ? lines(bottom, size) : null;
  return (
    <>
      {t && t.rows.map((r, i) => <text key={`t${i}`} x="150" y={8 + t.size * (i + 1.05)} style={style(t.size)}>{r}</text>)}
      {b && b.rows.map((r, i) => <text key={`b${i}`} x="150" y={292 - b.size * 1.05 * (b.rows.length - 1 - i)} style={style(b.size)}>{r}</text>)}
    </>
  );
}

/** White lab coat over a teal shirt, shoulders at y. */
function LabCoat({ cx: c, y }: { cx: number; y: number }) {
  return (
    <g>
      <path d={`M${c - 98} 300 L${c - 84} ${y + 22} Q${c - 62} ${y} ${c - 24} ${y - 4} L${c + 24} ${y - 4} Q${c + 62} ${y} ${c + 84} ${y + 22} L${c + 98} 300 Z`} fill="#fbfdfd" stroke="#c9d3d7" strokeWidth="2" />
      <path d={`M${c - 24} ${y - 4} L${c} ${y + 46} L${c + 24} ${y - 4} Z`} fill="#29a2b5" />
      <path d={`M${c - 24} ${y - 4} L${c - 6} ${y + 70} L${c - 34} ${y + 30} Z M${c + 24} ${y - 4} L${c + 6} ${y + 70} L${c + 34} ${y + 30} Z`} fill="#eef3f5" stroke="#c9d3d7" strokeWidth="1.5" />
      <rect x={c + 40} y={y + 40} width="26" height="18" rx="2" fill="#eef3f5" stroke="#c9d3d7" />
      <rect x={c + 46} y={y + 32} width="3" height="16" fill="#1f8a9c" />
    </g>
  );
}

export function MemeScene({ scene, top, bottom, size = 240, className }: { scene: Scene; top?: string; bottom?: string; size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const g = (n: string) => `${id}-${n}`;
  const label = [top, bottom].filter(Boolean).join(" ");
  return (
    <figure className={cx("no-print shrink-0 overflow-hidden rounded-xl shadow-[var(--shadow-card)]", className)} style={{ width: size, height: size }} title="The Sharminator">
      <svg viewBox="0 0 300 300" width={size} height={size} role="img" aria-label={label}>
        <defs>
          <filter id={g("grey")}><feColorMatrix type="saturate" values="0.15" /></filter>
          <linearGradient id={g("lab")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e1f3f5" /><stop offset="1" stopColor="#bee3e9" /></linearGradient>
          <linearGradient id={g("night")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#15354f" /><stop offset="1" stopColor="#041d2a" /></linearGradient>
        </defs>

        {/* "It cured cancer. In mice." */}
        {scene === "mice" && (
          <g>
            <rect width="300" height="300" fill="#dfe6e8" />
            <rect x="20" y="70" width="260" height="200" rx="6" fill="#f3f8fa" stroke="#9aa8ae" strokeWidth="3" />
            {Array.from({ length: 12 }, (_, i) => <line key={i} x1={32 + i * 21} x2={32 + i * 21} y1="70" y2="270" stroke="#9aa8ae" strokeWidth="1.5" />)}
            <rect x="20" y="236" width="260" height="34" fill="#e9d8b4" />
            <path d="M250 70 V40 h14 v30" fill="#bee3e9" stroke="#9aa8ae" strokeWidth="2" />
            {/* mouse body, ears and tail */}
            <ellipse cx="150" cy="226" rx="66" ry="28" fill="#f2f2f2" stroke="#b9c2c6" strokeWidth="2" />
            <path d="M214 230 Q262 236 258 206" stroke="#e9a6a6" strokeWidth="4" fill="none" strokeLinecap="round" />
            <circle cx="112" cy="104" r="22" fill="#f2f2f2" stroke="#b9c2c6" strokeWidth="2" /><circle cx="112" cy="104" r="12" fill="#f4c2c2" />
            <circle cx="188" cy="104" r="22" fill="#f2f2f2" stroke="#b9c2c6" strokeWidth="2" /><circle cx="188" cy="104" r="12" fill="#f4c2c2" />
            <Face x={116} y={98} w={68} neck={false} />
            <rect x="28" y="78" width="56" height="20" rx="2" fill="#fff" stroke="#9aa8ae" />
            <text x="56" y="92" textAnchor="middle" style={{ ...MONO, fontSize: 9, fill: "#17374d" }}>n = 6</text>
            <Caption top={top ?? "It cured cancer"} bottom={bottom ?? "in mice"} />
          </g>
        )}

        {/* "Representative Western blot" */}
        {scene === "blot" && (
          <g>
            <rect width="300" height="300" fill={`url(#${g("lab")})`} />
            <rect x="0" y="230" width="300" height="70" fill="#9aa8ae" />
            <Face x={68} y={56} w={84} />
            <LabCoat cx={110} y={196} />
            <rect x="168" y="104" width="118" height="92" rx="3" fill="#fff" stroke="#17374d" strokeWidth="2" />
            {[0, 1, 2, 3].map((r) => (
              <g key={r}>{[0, 1, 2, 3, 4].map((c) => <rect key={c} x={176 + c * 21} y={116 + r * 18} width="15" height="5" rx="2" fill="#17374d" opacity={r === 1 ? (c === 2 ? 0.95 : 0.12) : [0.6, 0.15, 0.85, 0.3][(c + r) % 4]} />)}</g>
            ))}
            <text x="227" y="190" textAnchor="middle" style={{ ...MONO, fontSize: 7, fill: "#17374d" }}>&quot;representative&quot;</text>
            <Caption top={top ?? "Send the raw data"} bottom={bottom ?? "Not the best blot out of 40"} size={19} />
          </g>
        )}

        {/* p = 0.049 */}
        {scene === "pvalue" && (
          <g>
            <rect width="300" height="300" fill={`url(#${g("night")})`} />
            {Array.from({ length: 26 }, (_, i) => <rect key={i} x={(i * 47) % 290} y={(i * 83) % 240 + 20} width="6" height="3" transform={`rotate(${i * 37} ${(i * 47) % 290} ${(i * 83) % 240 + 20})`} fill={["#29a2b5", "#f6d77a", "#17b1a7", "#e9a6a6"][i % 4]} />)}
            <Face x={108} y={60} w={84} />
            <LabCoat cx={150} y={200} />
            <rect x="196" y="58" width="92" height="40" rx="6" fill="#fff" />
            <text x="242" y="84" textAnchor="middle" style={{ ...MONO, fontSize: 15, fill: "#1a7d5a", fontWeight: 700 }}>p = 0.049</text>
            <Caption top={top ?? "Statistically significant"} bottom={bottom ?? "(we stopped analysing at 0.049)"} size={18} />
          </g>
        )}

        {/* Reading slide 31 of 47 */}
        {scene === "slide31" && (
          <g>
            <rect width="300" height="300" fill="#f3f8fa" />
            {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={150 + i * 4} y={60 + i * 4} width="130" height="86" fill="#fff" stroke="#c9d3d7" />)}
            <rect x="166" y="76" width="130" height="86" fill="#fff" stroke="#17374d" strokeWidth="1.5" />
            <text x="231" y="94" textAnchor="middle" style={{ fontSize: 8, fill: "#17374d", fontWeight: 700 }}>APPENDIX C (31/47)</text>
            <text x="174" y="152" style={{ fontSize: 5.5, fill: "#668296" }}>*14-day study, n = 3/arm, one species</text>
            <circle cx="210" cy="150" r="24" fill="none" stroke="#b4372b" strokeWidth="3" />
            <Face x={56} y={72} w={80} />
            <LabCoat cx={96} y={206} />
            <Caption top={top ?? "Found the tox data"} bottom={bottom ?? "It was a footnote on slide 31"} size={18} />
          </g>
        )}

        {/* Runway: 0 months */}
        {scene === "runway" && (
          <g>
            <rect width="300" height="300" fill="#fbf3e4" />
            <rect x="160" y="60" width="124" height="120" fill="#fff" stroke="#c9d3d7" />
            <text x="222" y="78" textAnchor="middle" style={{ fontSize: 8, fill: "#17374d", fontWeight: 700 }}>CASH (MONTHS OF RUNWAY)</text>
            <path d="M172 92 L196 104 L220 128 L244 152 L268 170" stroke="#b4372b" strokeWidth="3" fill="none" />
            <line x1="170" y1="170" x2="276" y2="170" stroke="#17374d" />
            <text x="262" y="164" style={{ ...MONO, fontSize: 9, fill: "#b4372b", fontWeight: 700 }}>0</text>
            <Face x={52} y={70} w={80} />
            <LabCoat cx={92} y={204} />
            <Caption top={top ?? "Out of runway"} bottom={bottom ?? "Should have raised the extension"} size={19} />
          </g>
        )}

        {/* Empty petri dish */}
        {scene === "petri" && (
          <g>
            <rect width="300" height="300" fill="#e1f3f5" />
            <ellipse cx="196" cy="170" rx="84" ry="38" fill="#f4d9a4" stroke="#c9b27a" strokeWidth="3" />
            <ellipse cx="196" cy="166" rx="84" ry="38" fill="none" stroke="#fff" strokeWidth="2" opacity="0.7" />
            <text x="196" y="174" textAnchor="middle" style={{ ...MONO, fontSize: 9, fill: "#8a6a2b" }}>0 colonies</text>
            <Face x={40} y={82} w={76} />
            <LabCoat cx={78} y={210} />
            <Caption top={top ?? "Deal pipeline"} bottom={bottom ?? "Nothing has grown yet"} />
          </g>
        )}

        {/* Failed to replicate */}
        {scene === "retracted" && (
          <g>
            <rect width="300" height="300" fill="#eef3f5" />
            <rect x="150" y="50" width="130" height="170" fill="#fff" stroke="#c9d3d7" />
            {Array.from({ length: 11 }, (_, i) => <rect key={i} x="162" y={68 + i * 12} width={i % 3 ? 106 : 80} height="4" fill="#c9d3d7" />)}
            <g transform="rotate(-18 215 135)">
              <rect x="160" y="118" width="110" height="34" fill="none" stroke="#b4372b" strokeWidth="4" />
              <text x="215" y="143" textAnchor="middle" style={{ ...IMPACT, fontSize: 20, fill: "#b4372b", letterSpacing: 2 }}>RETRACTED</text>
            </g>
            <Face x={46} y={74} w={80} filter={`url(#${g("grey")})`} />
            <LabCoat cx={86} y={208} />
            <Caption top={top ?? "This page"} bottom={bottom ?? "Failed to replicate"} />
          </g>
        )}

        {/* Reacting to a deck slide (rotating claims) */}
        {scene === "deck" && (
          <g>
            <rect width="300" height="300" fill="#f3f8fa" />
            <rect x="14" y="44" width="272" height="118" rx="4" fill="#fff" stroke="#17374d" strokeWidth="1.5" />
            <text x="26" y="62" style={{ fontSize: 8, fill: "#668296" }}>CONFIDENTIAL · SLIDE 4</text>
            <foreignObject x="24" y="68" width="252" height="90">
              <div style={{ fontFamily: "Poppins, Helvetica, sans-serif", fontSize: 15, fontWeight: 700, color: "#17374d", lineHeight: 1.25 }}>{top}</div>
            </foreignObject>
            <Face x={114} y={150} w={72} />
            <LabCoat cx={150} y={270} />
            <Caption bottom={bottom} size={17} />
          </g>
        )}
      </svg>
    </figure>
  );
}

/** Things founders put on slides, for the "Overheard in diligence" card. One per day. */
export const DECK_CLAIMS: { slide: string; reaction: string }[] = [
  { slide: "“We have no competitors.”", reaction: "The competitor table: 14 rows" },
  { slide: "“IND filing expected next quarter.”", reaction: "Said every quarter since 2019" },
  { slide: "TAM: $480B (everyone with a body)", reaction: "SAM: Ontario" },
  { slide: "“A platform company.”", reaction: "We haven't picked an indication either" },
  { slide: "“First-in-class.”", reaction: "Third program on that target this year" },
  { slide: "“Robust efficacy across all models.”", reaction: "Both models were mice" },
  { slide: "“Exit: acquisition by big pharma.”", reaction: "Big pharma has not been told" },
  { slide: "“Fold change: dramatic.”", reaction: "Fold change: 1.3" },
  { slide: "“Error bars shown.”", reaction: "What they represent: a mystery" },
  { slide: "“Capital efficient.”", reaction: "Raising $40M for a Phase 1" },
];

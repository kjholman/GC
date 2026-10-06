import fs from "node:fs";
import path from "node:path";
import { cx } from "./ui";

/**
 * Classic top/bottom-caption meme of the Sharminator, optionally with
 * "deal with it" pixel shades that drop onto his face. Internal screens only:
 * never used in founder correspondence or memos.
 */
const photo = (() => {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    try {
      if (fs.existsSync(path.join(process.cwd(), "public", "brand", `sharminator.${ext}`))) return `/brand/sharminator.${ext}`;
    } catch {}
  }
  return null;
})();

export const MEMES = {
  REJECT: { top: "Hasta la vista,", bottom: "deal", shades: true },
  PENDING_INFO: { top: "I need your data,", bottom: "your cap table and your tox report", shades: false },
  ADVANCE_TO_DILIGENCE: { top: "I'll be back", bottom: "with a term sheet", shades: true },
  RUNNING: { top: "Target acquired", bottom: "reading every slide", shades: false },
  PAUSED: { top: "I need your credits,", bottom: "your boots and your API key", shades: false },
  EMPTY: { top: "No deals?", bottom: "Come with me if you want to fund", shades: true },
  NOT_FOUND: { top: "I'll be back", bottom: "this page won't", shades: true },
} as const;

export type MemeKind = keyof typeof MEMES;

function Shades() {
  // 8-bit "deal with it" glasses, drawn on a 22 x 5 pixel grid.
  return (
    <svg viewBox="0 0 22 5" className="meme-shades absolute left-[21%] top-[29%] w-[58%]" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="0" y="0" width="22" height="1" fill="#000" />
      <rect x="1" y="1" width="8" height="3" fill="#000" />
      <rect x="13" y="1" width="8" height="3" fill="#000" />
      <rect x="2" y="4" width="6" height="1" fill="#000" />
      <rect x="14" y="4" width="6" height="1" fill="#000" />
      <rect x="9" y="1" width="4" height="1" fill="#000" />
      <rect x="2" y="1" width="1" height="1" fill="#fff" />
      <rect x="3" y="2" width="1" height="1" fill="#fff" />
      <rect x="14" y="1" width="1" height="1" fill="#fff" />
      <rect x="15" y="2" width="1" height="1" fill="#fff" />
    </svg>
  );
}

export function Meme({ kind, size = 220, className }: { kind: MemeKind; size?: number; className?: string }) {
  if (!photo) return null;
  const m = MEMES[kind];
  const text = "meme-text absolute inset-x-2 text-center uppercase leading-[1.05]";
  return (
    <figure
      className={cx("no-print group relative shrink-0 overflow-hidden rounded-xl bg-navy-900 select-none", className)}
      style={{ width: size, height: size, fontSize: Math.max(13, size / 11) }}
      title="The Sharminator"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} alt="The Sharminator" className="h-full w-full object-cover" />
      {m.shades && <Shades />}
      <figcaption className={cx(text, "top-2")}>{m.top}</figcaption>
      <figcaption className={cx(text, "bottom-2")}>{m.bottom}</figcaption>
    </figure>
  );
}

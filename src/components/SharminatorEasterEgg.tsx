"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MemeScene, type Scene } from "./MemeScene";

type Joke = { scene: Scene; top?: string; bottom?: string };

/** Page-specific jokes; the first matching prefix wins. */
const PAGE_JOKES: [string, Joke[]][] = [
  ["/login", [{ scene: "mice" }, { scene: "deck", top: "“Our security is enterprise-grade.”", bottom: "The password is on a sticky note" }]],
  ["/deals/new", [
    { scene: "deck", top: "Data room: 412 files", bottom: "The tox report is file 411" },
    { scene: "slide31" },
  ]],
  ["/deals/", [
    { scene: "mice" },
    { scene: "blot" },
    { scene: "deck", top: "“Exit: acquisition by big pharma.”", bottom: "Big pharma has not been told" },
    { scene: "deck", top: "“Robust efficacy across all models.”", bottom: "Both models were mice" },
  ]],
  ["/deals", [
    { scene: "deck", top: "“We have no competitors.”", bottom: "The competitor table: 14 rows" },
    { scene: "deck", top: "“IND filing expected next quarter.”", bottom: "Said every quarter since 2019" },
  ]],
  ["/knowledge", [
    { scene: "deck", top: "“We learn from every investment.”", bottom: "Lessons field: empty" },
    { scene: "retracted", top: "Institutional memory", bottom: "Failed to replicate" },
  ]],
  ["/training/backtests", [
    { scene: "pvalue", top: "Model accuracy: 94%", bottom: "(tested on the training set)" },
    { scene: "deck", top: "“Validated in a retrospective analysis.”", bottom: "Of the cases we picked" },
  ]],
  ["/training", [
    { scene: "deck", top: "“Our AI is fully trained.”", bottom: "n = 3 partner reviews" },
    { scene: "pvalue", top: "Model accuracy: 94%", bottom: "(tested on the training set)" },
  ]],
  ["/administration", [
    { scene: "runway", top: "Anthropic credit", bottom: "Burn rate: yes" },
    { scene: "deck", top: "“Capital efficient.”", bottom: "Raising $40M for a Phase 1" },
  ]],
  ["/", [
    { scene: "deck", top: "TAM: $480B (everyone with a body)", bottom: "SAM: Ontario" },
    { scene: "deck", top: "“A platform company.”", bottom: "We haven't picked an indication either" },
    { scene: "petri", top: "Monday morning", bottom: "Nothing has grown yet" },
  ]],
];

const SIDES = ["bottom-right", "bottom-left", "right", "left"] as const;
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * A small GAIA who peeks in from the edge of every page. Click him for a
 * joke that fits the page; click again for another. Hidden when printing.
 */
export function SharminatorEasterEgg() {
  const pathname = usePathname() ?? "/";
  const jokes = PAGE_JOKES.find(([p]) => (p === "/" ? pathname === "/" : pathname.startsWith(p)))?.[1] ?? PAGE_JOKES.at(-1)![1];
  const side = SIDES[hash(pathname) % SIDES.length];
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(0);
  const [shown, setShown] = useState(false);

  // Peek in a few seconds after the page settles, so he's easy to miss.
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const joke = jokes[(hash(pathname) + n) % jokes.length];
  const pos: Record<(typeof SIDES)[number], string> = {
    "bottom-right": "bottom-0 right-10 translate-y-[55%] hover:translate-y-[20%]",
    "bottom-left": "bottom-0 left-10 translate-y-[55%] hover:translate-y-[20%] lg:left-[280px]",
    right: "right-0 top-[62%] translate-x-[55%] -rotate-90 hover:translate-x-[25%]",
    left: "left-0 top-[70%] -translate-x-[55%] rotate-90 hover:-translate-x-[25%] lg:left-[252px]",
  };

  return (
    <>
      {/* Clipped to the screen so peeking past the edge never adds sideways scrolling. */}
      <div className="no-print pointer-events-none fixed inset-0 z-30 overflow-hidden">
        <button
          type="button"
          aria-label="Psst"
          title="Psst"
          onClick={() => setOpen(true)}
          className={`absolute h-12 w-9 transition-all duration-500 ${pos[side]} ${shown ? "pointer-events-auto opacity-70 hover:opacity-100" : "opacity-0"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/sharminator-face.png" alt="" className="h-full w-full object-contain drop-shadow" />
        </button>
      </div>
      {open && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="GAIA">
          <button aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-navy-950/60 backdrop-blur-[2px]" />
          <div className="relative flex flex-col items-center gap-3">
            <MemeScene scene={joke.scene} top={joke.top} bottom={joke.bottom} size={320} />
            <div className="flex gap-2">
              {jokes.length > 1 && (
                <button onClick={() => setN((x) => x + 1)} className="rounded-lg bg-paper px-3.5 py-2 text-[13px] font-medium text-navy-900 hover:bg-mist">Another one</button>
              )}
              <button onClick={() => setOpen(false)} className="rounded-lg bg-navy-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-brand-700">Back to work</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

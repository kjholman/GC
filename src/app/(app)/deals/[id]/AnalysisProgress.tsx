"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StepLog, asSteps, type LogStep } from "./StepLog";
import { stopAnalysisAction } from "@/lib/deals/actions";
import { useConfirm } from "@/components/Confirm";

// Each stage is matched by the first word of the server's progress line.
const STAGES: { label: string; match: RegExp }[] = [
  { label: "Reading", match: /^(Reading|Looking)/ },
  { label: "Researching", match: /^Researching/ },
  { label: "Writing the memo", match: /^Writing/ },
  { label: "Fact-checking", match: /^(Fact-checking|Fixing|Re-checking)/ },
];

export function AnalysisProgress({
  analysisId, version, initialProgress, initialSteps, startedAt, companyName, avatar,
}: { analysisId: string; version: number; initialProgress: string | null; initialSteps: LogStep[]; startedAt: string | null; companyName: string; avatar?: React.ReactNode }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initialProgress);
  const [steps, setSteps] = useState(initialSteps);
  const [elapsed, setElapsed] = useState(0);
  const [showLog, setShowLog] = useState(true);
  const logEnd = useRef<HTMLDivElement>(null);
  const [stopping, setStopping] = useState(false);
  const confirm = useConfirm();
  const [stopError, setStopError] = useState<string>();

  async function stop() {
    const ok = await confirm({
      title: "Stop this analysis?",
      body: "The work done so far is discarded. You can run it again later from the deal page.",
      confirmLabel: "Stop analysis",
      cancelLabel: "Keep running",
      danger: true,
    });
    if (!ok) return;
    setStopping(true);
    const res = await stopAnalysisAction(analysisId);
    if (!res.ok) {
      setStopError(res.error);
      setStopping(false);
    }
    router.refresh();
  }

  useEffect(() => {
    const start = startedAt ? new Date(startedAt).getTime() : Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    const poll = setInterval(async () => {
      const res = await fetch(`/api/analyses/${analysisId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setProgress(data.progress);
      setSteps(asSteps(data.steps));
      // Renamed after identifying the company: follow the deal to its new address.
      const here = window.location.pathname;
      const there = data.deal?.slug ? `/deals/${data.deal.slug}` : here;
      const done = data.status === "COMPLETE" || data.status === "FAILED" || data.status === "STOPPED" || data.status === "PAUSED";
      if (done) clearInterval(poll);
      if (there !== here) router.replace(there);
      else if (done || (data.deal?.companyName && data.deal.companyName !== companyName)) router.refresh();
    }, 3000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [analysisId, startedAt, router, companyName]);

  useEffect(() => {
    // Keep the newest line in view without scrolling the whole page.
    const box = logEnd.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [steps.length]);

  const stageIdx = Math.max(0, STAGES.findIndex((s) => s.match.test(progress ?? "")));
  const QUIPS = [
    "Reading the whole deck. Even the appendix.",
    "Searching the internet so you don't have to.",
    "Writing the memo. Hasta la vista, weak IP.",
    "Checking every claim. I don't do hallucinations.",
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-paper">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-4">
          {avatar}
          <div>
            <div className="eyebrow !text-brand-600">The Sharminator · version {version}</div>
            <div className="mt-1 font-display font-semibold text-[20px] text-ink">{progress ?? "Queued"}…</div>
            <div className="mt-0.5 text-[12.5px] italic text-muted">{QUIPS[stageIdx]}</div>
          </div>
        </div>
        <ol className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2 text-[12px]">
          {STAGES.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2 whitespace-nowrap">
              <span className={`h-2 w-2 rounded-full ${i < stageIdx ? "bg-pos" : i === stageIdx ? "pulse-dot bg-brand-500" : "bg-line-strong"}`} />
              <span className={i <= stageIdx ? "text-ink" : "text-muted"}>{s.label}</span>
              {i < STAGES.length - 1 && <span className="mx-1 h-px w-6 bg-line-strong" />}
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-4">
          <div className="tabular text-[12px] text-muted">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} elapsed
          </div>
          <button
            onClick={stop}
            disabled={stopping}
            className="rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-[12.5px] font-medium text-neg hover:border-neg hover:bg-neg-bg disabled:opacity-60"
          >
            {stopping ? "Stopping…" : "Stop analysis"}
          </button>
        </div>
        {stopError && <p className="w-full text-right text-[12px] text-neg">{stopError}</p>}
      </div>
      <div className="border-t border-line">
        <button onClick={() => setShowLog((v) => !v)} className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 text-left text-[13px] font-medium text-navy-800 hover:bg-mist/50">
          <span>What the Sharminator is doing{steps.length ? ` · ${steps.length} steps so far` : ""}</span>
          <span className="text-muted">{showLog ? "Hide" : "Show"}</span>
        </button>
        {showLog && (
          <div ref={logEnd} className="max-h-[360px] overflow-y-auto bg-[#f7fafb] px-4 py-4 sm:px-6">
            <StepLog steps={steps} live empty={progress ? "Working. Step-by-step updates appear here as each stage finishes." : undefined} />
          </div>
        )}
      </div>
      <div className="border-t border-line bg-mist/70 px-4 py-3 text-[12.5px] text-ink-soft sm:px-6">
        This runs on the server. You can leave this page, reload it or close the browser; the analysis keeps going and the memo will be here when it finishes.
      </div>
    </div>
  );
}

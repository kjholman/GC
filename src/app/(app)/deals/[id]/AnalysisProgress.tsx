"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StepLog, asSteps, type LogStep } from "./StepLog";

// Each stage is matched by the first word of the server's progress line.
const STAGES: { label: string; match: RegExp }[] = [
  { label: "Reading", match: /^(Reading|Looking)/ },
  { label: "Researching", match: /^Researching/ },
  { label: "Writing the memo", match: /^Writing/ },
  { label: "Fact-checking", match: /^(Fact-checking|Fixing|Re-checking)/ },
];

export function AnalysisProgress({
  analysisId, version, initialProgress, initialSteps, startedAt, companyName,
}: { analysisId: string; version: number; initialProgress: string | null; initialSteps: LogStep[]; startedAt: string | null; companyName: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initialProgress);
  const [steps, setSteps] = useState(initialSteps);
  const [elapsed, setElapsed] = useState(0);
  const [showLog, setShowLog] = useState(true);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const start = startedAt ? new Date(startedAt).getTime() : Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    const poll = setInterval(async () => {
      const res = await fetch(`/api/analyses/${analysisId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setProgress(data.progress);
      setSteps(asSteps(data.steps));
      // The Sharminator renamed the deal after identifying the company: refresh the header.
      if (data.deal?.companyName && data.deal.companyName !== companyName) router.refresh();
      if (data.status === "COMPLETE" || data.status === "FAILED") {
        clearInterval(poll);
        router.refresh();
      }
    }, 3000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [analysisId, startedAt, router, companyName]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "nearest" });
  }, [steps.length]);

  const stageIdx = Math.max(0, STAGES.findIndex((s) => s.match.test(progress ?? "")));

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-paper">
      <div className="shimmer h-1" />
      <div className="flex flex-wrap items-center gap-8 px-6 py-5">
        <div>
          <div className="eyebrow !text-brand-600">The Sharminator · version {version}</div>
          <div className="mt-1 font-display font-semibold text-[20px] text-ink">{progress ?? "Queued"}…</div>
        </div>
        <ol className="flex flex-1 items-center gap-3 text-[12px]">
          {STAGES.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${i < stageIdx ? "bg-pos" : i === stageIdx ? "pulse-dot bg-brand-500" : "bg-line-strong"}`} />
              <span className={i <= stageIdx ? "text-ink" : "text-muted"}>{s.label}</span>
              {i < STAGES.length - 1 && <span className="mx-1 h-px w-6 bg-line-strong" />}
            </li>
          ))}
        </ol>
        <div className="tabular text-[12px] text-muted">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} elapsed
        </div>
      </div>
      <div className="border-t border-line">
        <button onClick={() => setShowLog((v) => !v)} className="flex w-full items-center justify-between px-6 py-3 text-left text-[13px] font-medium text-navy-800 hover:bg-mist/50">
          <span>What the Sharminator is doing{steps.length ? ` · ${steps.length} steps so far` : ""}</span>
          <span className="text-muted">{showLog ? "Hide" : "Show"}</span>
        </button>
        {showLog && (
          <div className="max-h-[360px] overflow-y-auto bg-[#f7fafb] px-6 py-4">
            <StepLog steps={steps} live />
            <div ref={logEnd} />
          </div>
        )}
      </div>
      <div className="border-t border-line bg-mist/70 px-6 py-3 text-[12.5px] text-ink-soft">
        This runs on the server. You can leave this page, reload it or close the browser; the analysis keeps going and the memo will be here when it finishes.
      </div>
    </div>
  );
}

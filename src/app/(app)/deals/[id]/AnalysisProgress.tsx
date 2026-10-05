"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STAGES = [
  "Reading submitted materials",
  "Researching science, competitors and comparable deals",
  "Underwriting",
];

export function AnalysisProgress({ analysisId, version, initialProgress, startedAt }: { analysisId: string; version: number; initialProgress: string | null; startedAt: string | null }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initialProgress);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = startedAt ? new Date(startedAt).getTime() : Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    const poll = setInterval(async () => {
      const res = await fetch(`/api/analyses/${analysisId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setProgress(data.progress);
      if (data.status === "COMPLETE" || data.status === "FAILED") {
        clearInterval(poll);
        router.refresh();
      }
    }, 4000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [analysisId, startedAt, router]);

  const stageIdx = Math.max(0, STAGES.findIndex((s) => progress?.startsWith(s.split(" ")[0])));

  return (
    <div className="overflow-hidden rounded-[3px] border border-line bg-paper">
      <div className="shimmer h-1" />
      <div className="flex flex-wrap items-center gap-8 px-6 py-5">
        <div>
          <div className="eyebrow text-gold-600">AI analyst · version {version}</div>
          <div className="mt-1 font-serif text-[20px] text-navy-900">{progress ?? "Queued"}…</div>
        </div>
        <ol className="flex flex-1 items-center gap-3 text-[12px]">
          {STAGES.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${i < stageIdx ? "bg-pos" : i === stageIdx ? "pulse-dot bg-gold-500" : "bg-line-strong"}`} />
              <span className={i <= stageIdx ? "text-ink" : "text-muted"}>{s.split(",")[0].replace("Reading submitted materials", "Reading")}</span>
              {i < STAGES.length - 1 && <span className="mx-1 h-px w-6 bg-line-strong" />}
            </li>
          ))}
        </ol>
        <div className="tabular text-[12px] text-muted">
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} elapsed
        </div>
      </div>
    </div>
  );
}

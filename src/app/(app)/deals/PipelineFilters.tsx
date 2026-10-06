"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { inputCls } from "@/components/ui";

const sel = `${inputCls} !py-2 text-[13px] min-w-[170px] flex-[1_1_170px]`;

/** Filters for the pipeline. Every change updates the URL, so a filtered view can be bookmarked or shared. */
export function PipelineFilters({ sectors, stages }: { sectors: string[]; stages: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.push(`/deals?${next.toString()}`);
  };
  const active = ["rec", "sector", "stage", "from", "to", "minScore", "runs", "q"].some((k) => sp.get(k));
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <form
        className="min-w-[240px] flex-[2_1_280px]"
        onSubmit={(e) => {
          e.preventDefault();
          set("q", q.trim());
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== (sp.get("q") ?? "") && set("q", q.trim())} placeholder="Search company, sector, modality…" className={sel} aria-label="Search" />
      </form>
      <select aria-label="Recommendation" value={sp.get("rec") ?? ""} onChange={(e) => set("rec", e.target.value)} className={sel}>
        <option value="">Any recommendation</option>
        <option value="ADVANCE_TO_DILIGENCE">Advance to diligence</option>
        <option value="PENDING_INFO">Request information</option>
        <option value="REJECT">Decline</option>
        <option value="NONE">Not analysed yet</option>
      </select>
      <select aria-label="Sector" value={sp.get("sector") ?? ""} onChange={(e) => set("sector", e.target.value)} className={sel}>
        <option value="">Any sector</option>
        {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select aria-label="Development stage" value={sp.get("stage") ?? ""} onChange={(e) => set("stage", e.target.value)} className={sel}>
        <option value="">Any development stage</option>
        {stages.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select aria-label="Number of analyses" value={sp.get("runs") ?? ""} onChange={(e) => set("runs", e.target.value)} className={sel}>
        <option value="">Any number of analyses</option>
        <option value="0">Not analysed yet</option>
        <option value="1">1 analysis</option>
        <option value="2">2 analyses</option>
        <option value="3">3 or more</option>
      </select>
      <select aria-label="Minimum score" value={sp.get("minScore") ?? ""} onChange={(e) => set("minScore", e.target.value)} className={sel}>
        <option value="">Any score</option>
        {[80, 70, 60, 50].map((n) => <option key={n} value={n}>Score {n}+</option>)}
      </select>
      <label className="flex min-w-[170px] flex-[1_1_170px] flex-col">
        <span className="sr-only">Submitted from</span>
        <input type="date" aria-label="Submitted from" value={sp.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} className={sel} title="Submitted from" />
      </label>
      <label className="flex min-w-[170px] flex-[1_1_170px] flex-col">
        <span className="sr-only">Submitted to</span>
        <input type="date" aria-label="Submitted to" value={sp.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} className={sel} title="Submitted to" />
      </label>
      <div className="flex basis-full flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          Sort by
          <select aria-label="Sort" value={sp.get("sort") ?? "updated"} onChange={(e) => set("sort", e.target.value === "updated" ? "" : e.target.value)} className={`${inputCls} !w-auto !py-2 text-[13px]`}>
            <option value="updated">Recently updated</option>
            <option value="newest">Newest submitted</option>
            <option value="oldest">Oldest submitted</option>
            <option value="score">Highest score</option>
            <option value="name">Company name</option>
          </select>
        </div>
        {active && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              router.push(`/deals${sp.get("status") ? `?status=${sp.get("status")}` : ""}`);
            }}
            className="text-[12.5px] font-medium text-navy-700 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

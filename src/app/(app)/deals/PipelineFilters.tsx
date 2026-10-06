"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/ui";

/** Compact control style shared by every filter. */
const ctl = "h-9 rounded-lg border border-line-strong bg-paper px-3 text-[12.5px] text-ink focus:border-brand-500 focus:outline-none";

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
  const pick = (key: string, label: string, options: [string, string][]) => (
    <select aria-label={label} value={sp.get(key) ?? ""} onChange={(e) => set(key, e.target.value)} className={cx(ctl, "w-auto max-w-[190px]", sp.get(key) && "border-brand-500 bg-brand-100/40")}>
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <form
        className="w-full sm:w-64"
        onSubmit={(e) => {
          e.preventDefault();
          set("q", q.trim());
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== (sp.get("q") ?? "") && set("q", q.trim())} placeholder="Search company, sector…" className={cx(ctl, "w-full")} aria-label="Search" />
      </form>
      {pick("rec", "Recommendation", [["ADVANCE_TO_DILIGENCE", "Advance to diligence"], ["PENDING_INFO", "Request information"], ["REJECT", "Decline"], ["NONE", "Not analysed yet"]])}
      {pick("sector", "Sector", sectors.map((s) => [s, s]))}
      {pick("stage", "Stage", stages.map((s) => [s, s]))}
      {pick("runs", "Analyses", [["0", "None yet"], ["1", "1"], ["2", "2"], ["3", "3 or more"]])}
      {pick("minScore", "Score", [80, 70, 60, 50].map((n) => [String(n), `${n}+`]))}
      <span className="flex items-center gap-1.5 text-[12px] text-muted">
        Submitted
        <input type="date" aria-label="Submitted from" value={sp.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} className={cx(ctl, "w-[138px] px-2")} />
        to
        <input type="date" aria-label="Submitted to" value={sp.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} className={cx(ctl, "w-[138px] px-2")} />
      </span>
      <span className="ml-auto flex items-center gap-2 text-[12px] text-muted">
        {active && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              router.push(`/deals${sp.get("status") ? `?status=${sp.get("status")}` : ""}`);
            }}
            className="font-medium text-navy-700 hover:underline"
          >
            Clear filters
          </button>
        )}
        Sort
        <select aria-label="Sort" value={sp.get("sort") ?? "updated"} onChange={(e) => set("sort", e.target.value === "updated" ? "" : e.target.value)} className={cx(ctl, "w-auto")}>
          <option value="updated">Recently updated</option>
          <option value="newest">Newest submitted</option>
          <option value="oldest">Oldest submitted</option>
          <option value="score">Highest score</option>
          <option value="name">Company name</option>
        </select>
      </span>
    </div>
  );
}

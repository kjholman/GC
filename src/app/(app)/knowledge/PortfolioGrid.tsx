"use client";

import { useMemo, useState } from "react";
import type { PortfolioCompany } from "@prisma/client";
import { Card, cx } from "@/components/ui";
import { KnowledgeFiles, type KFile } from "@/components/KnowledgeFiles";
import { fillFromWebAction } from "@/lib/knowledge/actions";
import { DeleteCompanyButton, EditCompanyDialog } from "./PortfolioForm";

const OUTCOME: Record<string, { label: string; cls: string }> = {
  ACQUIRED: { label: "Acquired", cls: "bg-pos-bg text-pos" },
  IPO: { label: "IPO", cls: "bg-info-bg text-info" },
  MERGED: { label: "Merged", cls: "bg-info-bg text-info" },
  ACTIVE: { label: "Active", cls: "bg-brand-100 text-brand-600" },
  WOUND_DOWN: { label: "Wound down", cls: "bg-neg-bg text-neg" },
  UNKNOWN: { label: "Outcome n/a", cls: "bg-[#f1efea] text-muted" },
};

/** What a record is missing that GAIA would use. */
function missing(c: PortfolioCompany): string[] {
  const out: string[] = [];
  if (!c.website) out.push("website");
  if (!c.checkSize && !c.entryValuation) out.push("financials");
  if (!c.yearInvested) out.push("year invested");
  if (!c.lessons) out.push("lessons");
  return out;
}

/** The portfolio, searchable and filterable, with "Fill from the web" on each company. */
export function PortfolioGrid({ companies, files, canEdit }: { companies: PortfolioCompany[]; files: Record<string, KFile[]>; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState("");
  const [gaps, setGaps] = useState(false);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return companies.filter(
      (c) =>
        (!t || [c.name, c.sector, c.modality, c.indication, c.description].some((v) => v?.toLowerCase().includes(t))) &&
        (!outcome || c.outcome === outcome) &&
        (!gaps || missing(c).length > 0),
    );
  }, [companies, q, outcome, gaps]);

  if (!companies.length) {
    return (
      <Card className="py-12 text-center">
        <div className="font-display text-[20px] font-semibold text-navy-900">No portfolio companies yet</div>
        <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-soft">
          Upload a portfolio list or fund report under Add knowledge and GAIA will suggest the companies for you, or import the portfolio template, or add one by hand.
        </p>
      </Card>
    );
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies, sectors, indications…" aria-label="Search portfolio" className="h-9 w-full rounded-lg border border-line-strong bg-paper px-3 text-[13px] text-ink placeholder:text-[#9aaab5] focus:border-brand-500 focus:outline-none sm:w-72" />
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Outcome" className="h-9 w-auto min-w-[150px] rounded-lg border border-line-strong bg-paper pl-3 text-[13px] text-ink focus:border-brand-500 focus:outline-none">
          <option value="">Any outcome</option>
          {Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
          <input type="checkbox" checked={gaps} onChange={(e) => setGaps(e.target.checked)} className="accent-navy-900" />
          Only records with gaps
        </label>
        <span className="ml-auto text-[12px] text-muted">{shown.length} of {companies.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {shown.map((c) => (
          <CompanyCard key={c.id} c={c} files={files[c.id] ?? []} canEdit={canEdit} />
        ))}
      </div>
      {!shown.length && <p className="py-8 text-center text-[13px] text-muted">No companies match. Clear the search or filters.</p>}
    </div>
  );
}

function CompanyCard({ c, files, canEdit }: { c: PortfolioCompany; files: KFile[]; canEdit: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const gaps = missing(c);
  const facts = [c.checkSize && `Invested ${c.checkSize}`, c.entryValuation && `entry ${c.entryValuation}`, c.ownership && `${c.ownership} owned`, c.returnMultiple && `return ${c.returnMultiple}`].filter(Boolean);
  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-[20px] leading-tight text-navy-900">{c.name}</h3>
          <div className="mt-1 text-[12.5px] text-muted">
            {[c.sector, c.modality].filter(Boolean).join(" · ")}
            {c.website && (
              <> · <a href={c.website} target="_blank" rel="noreferrer" className="text-navy-700 hover:underline">{c.website.replace(/^https?:\/\/(www\.)?/, "")}</a></>
            )}
          </div>
        </div>
        <span className={cx("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", OUTCOME[c.outcome].cls)}>{OUTCOME[c.outcome].label}</span>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">{c.description}</p>
      {facts.length > 0 && <p className="mt-2 text-[12.5px] text-ink">{facts.join(" · ")}</p>}
      {c.outcomeNotes && <p className="mt-2 text-[13px] leading-relaxed text-ink"><span className="text-muted">Outcome: </span>{c.outcomeNotes}</p>}
      {c.lessons && <p className="mt-2 border-l-2 border-brand-500 pl-3 text-[13px] italic leading-relaxed text-ink">{c.lessons}</p>}
      {gaps.length > 0 && <p className="mt-2 text-[12px] text-warn">Missing: {gaps.join(", ")}</p>}
      {(canEdit || files.length > 0) && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12.5px] font-medium text-navy-700">Files ({files.length})</summary>
          <div className="mt-2">
            <KnowledgeFiles scope="PORTFOLIO" targetId={c.id} files={files} canEdit={canEdit} compact hint="Board decks, updates, cap tables: GAIA reads them and suggests details for this record." />
          </div>
        </details>
      )}
      {msg && <p className="mt-2 text-[12.5px] text-pos">{msg}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-[11.5px] text-muted">
        <span>
          {[c.stageAtEntry, c.yearInvested].filter(Boolean).join(" · ")}
          {!c.verified && <span className="ml-2 text-warn">● Unverified</span>}
        </span>
        {canEdit && (
          <span className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMsg(null);
                const r = await fillFromWebAction(c.id);
                setMsg(r.message ?? r.error ?? null);
                setBusy(false);
              }}
              className="text-navy-700 hover:underline"
            >
              {busy ? "Searching online…" : "Fill from the web"}
            </button>
            <EditCompanyDialog company={c} />
            <DeleteCompanyButton id={c.id} name={c.name} />
          </span>
        )}
      </div>
    </Card>
  );
}

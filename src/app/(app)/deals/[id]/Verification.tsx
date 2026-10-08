import type { Memo } from "@/lib/ai/schema";
import type { VerificationReport } from "@/lib/ai/verify";
import { Card, SectionTitle, cx } from "@/components/ui";

const STATUS: Record<string, { label: string; cls: string; dot: string; blurb: string }> = {
  PASSED: { label: "Fact-check passed", cls: "border-[#c9e2d9] bg-pos-bg", dot: "bg-pos", blurb: "Every important claim was traced to a source. Nothing to fix." },
  WARNINGS: { label: "Fact-check: a few points to review", cls: "border-[#efdcb4] bg-warn-bg", dot: "bg-warn", blurb: "Nothing made up or contradicted, but some claims lack a source or are stated too strongly." },
  FAILED: { label: "Fact-check: problems remain", cls: "border-[#efd2ce] bg-neg-bg", dot: "bg-neg", blurb: "Some serious problems remain after GAIA's own correction. Check these points before relying on the memo." },
};

const SEVERITY: Record<string, string> = { HIGH: "Serious", MEDIUM: "Check", LOW: "Minor" };
const PROBLEM: Record<string, string> = {
  FABRICATED_ENTITY: "Not found in any source",
  MISQUOTED: "Quote doesn't match the document",
  CONTRADICTED: "Sources say otherwise",
  UNSUPPORTED: "No source given",
  OVERSTATED_CERTAINTY: "Stated too strongly",
  INTERNAL_INCONSISTENCY: "Numbers or sections don't agree",
  RULE_VIOLATION: "Breaks a Genesys rule",
};
const SECTIONS: [string, string][] = [
  ["evidence", "Sources"], ["portfolioFit", "Portfolio fit"], ["team", "Team"], ["intellectualProperty", "IP"],
  ["market", "Market"], ["financials", "Financials"], ["scorecard", "Scores"], ["overallScore", "Scores"],
  ["recommendation", "Recommendation"], ["founderEmail", "Founder email"], ["competit", "Competitive landscape"],
];
function whereLabel(loc: string) {
  return SECTIONS.find(([k]) => loc.startsWith(k))?.[1] ?? "";
}

export function VerificationBanner({ report, signedOff }: { report: VerificationReport | null; signedOff: { by: string; at: string } | null }) {
  if (!report) {
    return (
      <div className="rounded-lg border border-line bg-paper px-6 py-4 text-[13px] text-muted">
        This memo was written before fact-checking was added. Run the analysis again to have it checked.
      </div>
    );
  }
  const s = STATUS[report.status];
  const open = report.issues.filter((i) => i.severity !== "LOW");
  return (
    <div className={cx("rounded-lg border px-6 py-4", s.cls)}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2.5">
          <span className={cx("h-2.5 w-2.5 rounded-full", s.dot)} />
          <span className="text-[14px] font-medium text-ink">{s.label}</span>
        </div>
        <span className="text-[12.5px] text-ink-soft tabular">
          {report.evidenceCount} claims sourced · {report.quotesVerified} quotes matched to the documents · {report.claimsChecked} double-checked
          {report.revisions ? " · corrected once" : ""}
        </span>
        <span className={cx("ml-auto text-[12.5px] font-medium", signedOff ? "text-pos" : "text-warn")}>
          {signedOff ? `Signed off by ${signedOff.by}, ${signedOff.at}` : "Awaiting analyst sign-off"}
        </span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{s.blurb} {report.assessment}</p>
      {open.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] font-medium text-navy-800">
            {open.length} point{open.length === 1 ? "" : "s"} to review
          </summary>
          <ul className="mt-3 space-y-3">
            {open.map((i, n) => (
              <li key={n} className="rounded-lg bg-paper/80 px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", i.severity === "HIGH" ? "bg-neg text-white" : "bg-warn-bg text-warn")}>{SEVERITY[i.severity] ?? i.severity}</span>
                  <span className="text-[12px] text-muted">{PROBLEM[i.problem] ?? "Needs a look"}{whereLabel(i.location) ? ` · ${whereLabel(i.location)}` : ""}</span>
                </div>
                <p className="mt-1.5 text-ink">&ldquo;{i.excerpt}&rdquo;</p>
                <p className="mt-1 text-ink-soft">{i.explanation}</p>
                <p className="mt-1 text-ink-soft"><span className="text-muted">Fix: </span>{i.correction}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const SRC: Record<string, string> = {
  DECK_OR_MATERIALS: "Company materials",
  RESEARCH_BRIEF: "Web research",
  PRECEDENT: "Past Genesys deal",
  FIRM_CONTEXT: "Genesys records",
  BENCHMARK: "Industry benchmark",
  GENERAL_KNOWLEDGE: "General knowledge",
  ANALYST_INFERENCE: "GAIA's judgement",
};
const STATUS_LABEL: Record<string, string> = {
  VERIFIED_IN_SOURCE: "Confirmed in source",
  COMPANY_CLAIM: "Company's claim",
  INFERENCE: "Judgement",
  NEEDS_VERIFICATION: "Needs checking",
};
const ST: Record<string, string> = {
  VERIFIED_IN_SOURCE: "text-pos",
  COMPANY_CLAIM: "text-warn",
  INFERENCE: "text-navy-700",
  NEEDS_VERIFICATION: "text-neg",
};

export function EvidenceLedger({ memo, report }: { memo: Memo; report: VerificationReport | null }) {
  const flagged = new Set((report?.issues ?? []).map((i) => i.location.replace("evidence ", "")));
  const counts = Object.fromEntries(Object.keys(ST).map((k) => [k, memo.evidence.filter((e) => e.status === k).length]));
  return (
    <Card pad={false}>
      <div className="px-6 pt-6">
        <SectionTitle eyebrow="Sources" title="Every important claim and where it came from" />
        <div className="-mt-2 mb-5 flex flex-wrap gap-5 text-[12.5px]">
          {Object.entries(counts).map(([k, n]) => (
            <span key={k} className={ST[k]}>{n} {STATUS_LABEL[k].toLowerCase()}</span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
      <table className="stack-sm w-full sm:min-w-[620px] text-left text-[13px]">
        <thead>
          <tr className="border-y border-line text-[11px] uppercase tracking-[0.12em] text-muted">
            <th className="py-2.5 pr-3 pl-6 font-semibold">#</th>
            <th className="px-3 py-2.5 font-semibold">Claim</th>
            <th className="px-3 py-2.5 font-semibold">Source</th>
            <th className="py-2.5 pr-6 pl-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {memo.evidence.map((e) => (
            <tr key={e.id} id={`ev-${e.id}`} className={cx(flagged.has(e.id) && "bg-neg-bg/60")}>
              <td className="py-3 pr-3 pl-6 align-top font-mono text-[11.5px] text-muted">{e.id}</td>
              <td data-label="Claim" className="px-3 py-3 align-top">
                <div className="text-ink">{e.claim}</div>
                {e.quote && <div className="mt-1 border-l-2 border-line-strong pl-2 text-[12px] italic text-muted">&ldquo;{e.quote}&rdquo;</div>}
              </td>
              <td data-label="Source" className="px-3 py-3 align-top text-[12px] text-ink-soft">
                <div className="font-medium">{SRC[e.sourceType]}</div>
                <div className="text-muted [overflow-wrap:anywhere]">{e.sourceRef}</div>
              </td>
              <td data-label="Status" className={cx("py-3 pr-6 pl-3 align-top text-[12px] font-medium", ST[e.status])}>
                {STATUS_LABEL[e.status] ?? e.status}
                {flagged.has(e.id) && <div className="text-neg">⚠ Needs a look</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </Card>
  );
}

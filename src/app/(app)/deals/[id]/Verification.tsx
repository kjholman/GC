import type { Memo } from "@/lib/ai/schema";
import type { VerificationReport } from "@/lib/ai/verify";
import { Card, SectionTitle, cx } from "@/components/ui";

const STATUS: Record<string, { label: string; cls: string; dot: string; blurb: string }> = {
  PASSED: { label: "Fact-check passed", cls: "border-[#c9e2d9] bg-pos-bg", dot: "bg-pos", blurb: "Every material claim traced to a source; no issues found." },
  WARNINGS: { label: "Fact-check: review warnings", cls: "border-[#efdcb4] bg-warn-bg", dot: "bg-warn", blurb: "No fabricated or contradicted facts, but some claims are unsupported or overstated." },
  FAILED: { label: "Fact-check: unresolved issues", cls: "border-[#efd2ce] bg-neg-bg", dot: "bg-neg", blurb: "Serious issues remain after automatic correction. Verify these points before relying on the memo." },
};

export function VerificationBanner({ report, signedOff }: { report: VerificationReport | null; signedOff: { by: string; at: string } | null }) {
  if (!report) {
    return (
      <div className="rounded-lg border border-line bg-paper px-6 py-4 text-[13px] text-muted">
        This memo predates automated fact-checking. Re-run the analysis to verify it.
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
          {report.evidenceCount} claims in ledger · {report.quotesVerified} quotes matched to source · {report.claimsChecked} checked independently
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
            {open.length} issue{open.length === 1 ? "" : "s"} to review
          </summary>
          <ul className="mt-3 space-y-3">
            {open.map((i, n) => (
              <li key={n} className="rounded-lg bg-paper/80 px-4 py-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", i.severity === "HIGH" ? "bg-neg text-white" : "bg-warn-bg text-warn")}>{i.severity}</span>
                  <span className="text-[11.5px] uppercase tracking-[0.08em] text-muted">{i.problem.replaceAll("_", " ").toLowerCase()} · {i.location} · {i.origin}</span>
                </div>
                <p className="mt-1.5 text-ink">&ldquo;{i.excerpt}&rdquo;</p>
                <p className="mt-1 text-ink-soft">{i.explanation}</p>
                <p className="mt-1 text-ink-soft"><span className="text-muted">Correction: </span>{i.correction}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const SRC: Record<string, string> = {
  DECK_OR_MATERIALS: "Materials",
  RESEARCH_BRIEF: "Research",
  PRECEDENT: "Precedent",
  FIRM_CONTEXT: "Firm",
  BENCHMARK: "Benchmark",
  GENERAL_KNOWLEDGE: "Background",
  ANALYST_INFERENCE: "Inference",
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
        <SectionTitle eyebrow="Evidence ledger" title="Every material claim and its source" />
        <div className="-mt-2 mb-5 flex flex-wrap gap-5 text-[12.5px]">
          {Object.entries(counts).map(([k, n]) => (
            <span key={k} className={ST[k]}>{n} {k.replaceAll("_", " ").toLowerCase()}</span>
          ))}
        </div>
      </div>
      <table className="w-full text-left text-[13px]">
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
              <td className="px-3 py-3 align-top">
                <div className="text-ink">{e.claim}</div>
                {e.quote && <div className="mt-1 border-l-2 border-line-strong pl-2 text-[12px] italic text-muted">&ldquo;{e.quote}&rdquo;</div>}
              </td>
              <td className="px-3 py-3 align-top text-[12px] text-ink-soft">
                <div className="font-medium">{SRC[e.sourceType]}</div>
                <div className="text-muted [overflow-wrap:anywhere]">{e.sourceRef}</div>
              </td>
              <td className={cx("py-3 pr-6 pl-3 align-top text-[12px] font-medium", ST[e.status])}>
                {e.status.replaceAll("_", " ").toLowerCase()}
                {flagged.has(e.id) && <div className="text-neg">⚠ flagged</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

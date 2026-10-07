import type { ReactNode } from "react";
import type { Memo } from "@/lib/ai/schema";
import { Card, SectionTitle, cx, scoreColor } from "@/components/ui";
import { EvidenceTag } from "./Evidence";

/** Render text with [E#] evidence tags as inline citation chips. */
export function Tagged({ text }: { text: string }) {
  const parts = text.split(/(\[E\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[(E\d+)\]$/);
        return m ? <EvidenceTag key={i} id={m[1]} /> : p;
      })}
    </>
  );
}

const SEV: Record<string, string> = {
  CRITICAL: "bg-neg text-white",
  HIGH: "bg-neg-bg text-neg",
  MEDIUM: "bg-warn-bg text-warn",
  LOW: "bg-navy-50 text-navy-700",
};

export function Paras({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cx("prose-memo text-[14.5px] leading-[1.7] text-ink-soft [overflow-wrap:anywhere]", className)}>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-line"><Tagged text={p} /></p>
      ))}
    </div>
  );
}

function Pill({ children, cls }: { children: ReactNode; cls: string }) {
  return <span className={cx("inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", cls)}>{children}</span>;
}

function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-t border-line py-4 first:border-t-0 first:pt-0 md:grid-cols-[200px_1fr] md:gap-6">
      <div className="eyebrow pt-0.5">{label}</div>
      <div>{typeof children === "string" ? <Paras text={children} /> : children}</div>
    </div>
  );
}

function Bullets({ items, marker = "•" }: { items: string[]; marker?: string }) {
  if (!items.length) return <p className="text-[14px] text-muted">None identified.</p>;
  return (
    <ul className="space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-ink-soft">
          <span className="shrink-0 text-brand-500">{marker}</span>
          <span><Tagged text={t} /></span>
        </li>
      ))}
    </ul>
  );
}

/**
 * How much of the memo rests on independent research versus the company's own
 * materials, from the evidence ledger, so a reader can see it isn't just the deck.
 */
function SourcingSummary({ memo, webSourceCount }: { memo: Memo; webSourceCount: number }) {
  const ev = memo.evidence ?? [];
  if (!ev.length) return null;
  const groups = [
    { key: "independent", label: "Independent research online", cls: "bg-brand-500", n: ev.filter((e) => e.sourceType === "RESEARCH_BRIEF" || e.sourceType === "COMPETITOR_SWEEP").length },
    { key: "deck", label: "Company's own materials", cls: "bg-navy-700", n: ev.filter((e) => e.sourceType === "DECK_OR_MATERIALS").length },
    { key: "firm", label: "Genesys records and benchmarks", cls: "bg-[#c9a227]", n: ev.filter((e) => e.sourceType === "PRECEDENT" || e.sourceType === "FIRM_CONTEXT" || e.sourceType === "BENCHMARK").length },
    { key: "reasoning", label: "Analysis and background knowledge", cls: "bg-line-strong", n: ev.filter((e) => e.sourceType === "ANALYST_INFERENCE" || e.sourceType === "GENERAL_KNOWLEDGE").length },
  ].filter((g) => g.n > 0);
  const unconfirmed = ev.filter((e) => e.sourceType === "DECK_OR_MATERIALS" && e.status === "COMPANY_CLAIM").length;
  const pct = (n: number) => Math.round((n / ev.length) * 100);
  return (
    <Card>
      <div className="eyebrow mb-1">How this memo was sourced</div>
      <p className="mb-3 text-[13px] text-ink-soft">
        {ev.length} material claims, checked against {webSourceCount} web source{webSourceCount === 1 ? "" : "s"} found by the Sharminator&apos;s own research, not just the deck.
      </p>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-line">
        {groups.map((g) => <div key={g.key} className={g.cls} style={{ width: `${pct(g.n)}%` }} title={`${g.label}: ${g.n}`} />)}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
        {groups.map((g) => (
          <li key={g.key} className="flex items-center gap-2 text-ink-soft">
            <span className={cx("h-2 w-2 shrink-0 rounded-full", g.cls)} />
            {g.label}
            <span className="ml-auto whitespace-nowrap pl-2 tabular text-ink">{g.n} · {pct(g.n)}%</span>
          </li>
        ))}
      </ul>
      {unconfirmed > 0 && (
        <p className="mt-3 text-[12.5px] text-warn">
          {unconfirmed === 1
            ? "1 claim from the company could not be confirmed independently; it is marked as a company claim in the evidence list."
            : `${unconfirmed} claims from the company could not be confirmed independently; they are marked as company claims in the evidence list.`}
        </p>
      )}
    </Card>
  );
}

export function MemoView({ memo, firstAnalysis = false, webSourceCount = 0 }: { memo: Memo; firstAnalysis?: boolean; webSourceCount?: number }) {
  return (
    <div className="space-y-8">
      <SourcingSummary memo={memo} webSourceCount={webSourceCount} />
      <Card className={cx("border-l-4", memo.worthOurTime.verdict ? "border-l-pos" : "border-l-neg")}>
        <div className="eyebrow mb-2">Is this worth our time?</div>
        <div className="flex items-start gap-4">
          <span className={cx("mt-1 font-display font-semibold text-[26px] leading-none", memo.worthOurTime.verdict ? "text-pos" : "text-neg")}>
            {memo.worthOurTime.verdict ? "Yes." : "No."}
          </span>
          <h3 className="font-display font-semibold text-[24px] leading-snug text-navy-900">{memo.worthOurTime.headline}</h3>
        </div>
        <Paras text={memo.worthOurTime.rationale} className="mt-4" />
      </Card>

      {memo.versionDelta && !firstAnalysis && (
        <Card className="!bg-brand-100/50 !border-brand-300">
          <div className="eyebrow mb-2 text-brand-600">What changed in this version</div>
          <Paras text={memo.versionDelta} />
        </Card>
      )}

      <Card>
        <SectionTitle eyebrow="Executive summary" title="The opportunity" />
        <Paras text={memo.executiveSummary} className="text-[15px]" />
        <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <div className="eyebrow mb-3 text-pos">Investment highlights</div>
            <Bullets items={memo.investmentHighlights} marker="+" />
          </div>
          <div>
            <div className="eyebrow mb-3 text-neg">Red flags</div>
            <Bullets items={memo.redFlags} marker="!" />
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle eyebrow="Scorecard" title="Assessment by dimension" />
        <div className="divide-y divide-line">
          {memo.scorecard.map((s) => (
            <details key={s.dimension} className="group py-4 first:pt-0">
              <summary className="flex cursor-pointer list-none items-center gap-5">
                <div className="w-52 shrink-0 text-[14px] font-medium text-navy-900">{s.dimension}</div>
                <div className="flex h-2 flex-1 gap-[3px]">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex-1 rounded-[1px]" style={{ background: i < s.score ? scoreColor(s.score * 10) : "var(--color-line)" }} />
                  ))}
                </div>
                <div className="w-10 text-right font-display font-semibold text-[20px] tabular text-navy-900">{s.score}</div>
                <span className="text-muted transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-4 pl-0 md:grid-cols-2 md:pl-[228px]">
                <div>
                  <div className="eyebrow mb-1">Assessment</div>
                  <p className="text-[13.5px] leading-relaxed text-ink-soft"><Tagged text={s.assessment} /></p>
                </div>
                <div>
                  <div className="eyebrow mb-1">Evidence</div>
                  <p className="text-[13.5px] leading-relaxed text-ink-soft"><Tagged text={s.evidence} /></p>
                </div>
              </div>
            </details>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle eyebrow="Science" title="Scientific assessment" />
        <KV label="Mechanism of action">{memo.science.mechanismOfAction}</KV>
        <KV label="Biological rationale">{memo.science.biologicalRationale}</KV>
        <KV label="Data quality">{memo.science.dataQuality}</KV>
        <KV label="Translational risk">{memo.science.translationalRisk}</KV>
        <KV label="Key de-risking experiments"><Bullets items={memo.science.keyExperimentsToDerisk} /></KV>
      </Card>

      <Card>
        <SectionTitle eyebrow="Development" title="Clinical & regulatory path" />
        <KV label="Pathway">{memo.clinicalRegulatory.pathway}</KV>
        <KV label="Probability of success">{memo.clinicalRegulatory.probabilityOfSuccess}</KV>
        <div className="mt-2 overflow-x-auto">
          <div className="overflow-x-auto">
          <table className="stack-sm w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="py-2 pr-4 font-semibold">Milestone</th>
                <th className="px-4 py-2 font-semibold">Timing</th>
                <th className="px-4 py-2 font-semibold">Capital</th>
                <th className="py-2 pl-4 text-right font-semibold">Inflection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {memo.clinicalRegulatory.milestones.map((m, i) => (
                <tr key={i}>
                  <td data-label="Milestone" className="py-3 pr-4 text-ink"><Tagged text={m.milestone} /></td>
                  <td data-label="Timing" className="px-4 py-3 text-ink-soft">{m.expectedTiming}</td>
                  <td data-label="Capital" className="px-4 py-3 text-ink-soft">{m.capitalRequired ?? "Not stated"}</td>
                  <td data-label="Inflection" className="py-3 pl-4 text-right">{m.valueInflection ? <span className="text-brand-600">◆</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle eyebrow="Diligence workstreams" title="Market, IP and team at a glance" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div>
            <div className="eyebrow mb-1">Market</div>
            <p className="text-[13.5px] leading-relaxed text-ink-soft"><Tagged text={memo.market.addressableMarket} /></p>
          </div>
          <div>
            <div className="eyebrow mb-1">Intellectual property{memo.intellectualProperty.strength ? ` · ${memo.intellectualProperty.strength.toLowerCase()}` : ""}</div>
            <p className="text-[13.5px] leading-relaxed text-ink-soft"><Tagged text={memo.intellectualProperty.position} /></p>
          </div>
          <div>
            <div className="eyebrow mb-1">Founders &amp; management</div>
            <p className="text-[13.5px] leading-relaxed text-ink-soft"><Tagged text={memo.team.assessment} /></p>
          </div>
        </div>
        <p className="mt-5 text-[12px] text-muted">The full analysis is in the Market, IP and Team tabs.</p>
      </Card>

      <Card>
        <SectionTitle eyebrow="Risk register" title="Key risks" />
        <div className="divide-y divide-line">
          {memo.keyRisks.map((r, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 py-4 first:pt-0 md:grid-cols-[90px_1fr_1fr] md:gap-6">
              <div><Pill cls={SEV[r.severity]}>{r.severity}</Pill></div>
              <p className="text-[14px] font-medium leading-relaxed text-ink"><Tagged text={r.risk} /></p>
              <p className="text-[13.5px] leading-relaxed text-ink-soft"><span className="text-muted">Mitigation: </span><Tagged text={r.mitigation} /></p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="!bg-[#fbfaf7]">
        <div className="eyebrow mb-2">Analyst caveats</div>
        <Paras text={memo.analystCaveats} className="text-[13.5px]" />
      </Card>
    </div>
  );
}

export function FinancialsView({ memo }: { memo: Memo }) {
  const f = memo.financials;
  const scen = [...f.returnScenarios].sort((a, b) => ["BEAR", "BASE", "BULL"].indexOf(a.scenario) - ["BEAR", "BASE", "BULL"].indexOf(b.scenario));
  const probSum = scen.reduce((s, x) => s + (x.probability ?? 0), 0);
  const expMoic = scen.reduce((s, x) => s + (x.grossMoic ?? 0) * (x.probability ?? 0), 0);
  const maxMoic = Math.max(1, ...scen.map((s) => s.grossMoic ?? 0));
  const tone: Record<string, string> = { BEAR: "var(--color-neg)", BASE: "var(--color-brand-500)", BULL: "var(--color-pos)" };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        <div className="bg-paper px-6 py-5">
          <div className="eyebrow">Probability-weighted MOIC</div>
          <div className="mt-2 font-display font-semibold text-[36px] leading-none tabular text-navy-900">{expMoic.toFixed(1)}×</div>
          <div className="mt-2 text-[12px] text-muted">Gross, on Genesys capital</div>
        </div>
        <div className="bg-paper px-6 py-5">
          <div className="eyebrow">Loss probability</div>
          <div className="mt-2 font-display font-semibold text-[36px] leading-none tabular text-navy-900">{Math.round(Math.max(0, 1 - probSum) * 100)}%</div>
          <div className="mt-2 text-[12px] text-muted">Residual to scenarios</div>
        </div>
        {scen.filter((s) => s.scenario !== "BEAR").map((s) => (
          <div key={s.scenario} className="bg-paper px-6 py-5">
            <div className="eyebrow">{s.scenario === "BASE" ? "Base case" : "Bull case"} exit</div>
            <div className="mt-2 font-display font-semibold text-[36px] leading-none tabular text-navy-900">
              {s.exitValueUsdM != null ? `$${s.exitValueUsdM >= 1000 ? `${(s.exitValueUsdM / 1000).toFixed(1)}B` : `${Math.round(s.exitValueUsdM)}M`}` : "n/a"}
            </div>
            <div className="mt-2 text-[12px] text-muted">{s.yearsToExit != null ? `~${s.yearsToExit} years · ` : ""}{s.exitRoute}</div>
          </div>
        ))}
      </div>

      <Card>
        <SectionTitle eyebrow="Returns" title="Exit scenarios" />
        <div className="space-y-6">
          {scen.map((s) => (
            <div key={s.scenario} className="grid grid-cols-1 gap-4 md:grid-cols-[110px_1fr]">
              <div>
                <div className="text-[12px] font-semibold tracking-[0.14em]" style={{ color: tone[s.scenario] }}>{s.scenario}</div>
                <div className="mt-1 text-[12px] text-muted tabular">p = {Math.round((s.probability ?? 0) * 100)}%</div>
              </div>
              <div>
                <div className="flex items-center gap-4">
                  <div className="h-2.5 flex-1 rounded-full bg-line">
                    <div className="h-2.5 rounded-full" style={{ width: `${((s.grossMoic ?? 0) / maxMoic) * 100}%`, background: tone[s.scenario] }} />
                  </div>
                  <div className="w-16 text-right font-display font-semibold text-[22px] tabular text-navy-900">{s.grossMoic != null ? `${s.grossMoic.toFixed(1)}×` : "n/a"}</div>
                </div>
                <div className="mt-2 text-[13px] text-ink-soft">
                  <span className="font-medium text-ink">{s.exitRoute}</span>
                  {s.exitValueUsdM != null && <> · US${s.exitValueUsdM.toLocaleString()}M</>}
                  {s.yearsToExit != null && <> · {s.yearsToExit} yrs</>}
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft"><Tagged text={s.rationale} /></p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle eyebrow="Financials" title="Round, valuation and capital plan" />
        <KV label="Ask & use of funds">{f.askAndUseOfFunds}</KV>
        <KV label="Valuation">{f.valuationView}</KV>
        <KV label="Burn & runway">{f.burnAndRunway}</KV>
        <KV label="Capital to next inflection">{f.capitalToNextInflection}</KV>
        <KV label="Projections critique">{f.projectionsCritique}</KV>
      </Card>
    </div>
  );
}

export function FitView({ memo }: { memo: Memo }) {
  const p = memo.portfolioFit;
  return (
    <div className="space-y-8">
      <Card>
        <SectionTitle eyebrow="Strategy" title="Fit with the Genesys thesis" />
        <KV label="Thesis alignment">{p.thesisAlignment}</KV>
        <KV label="Canadian nexus">{p.canadianNexus}</KV>
        <KV label="Syndicate & role">{p.syndicateView}</KV>
        <KV label="Portfolio conflicts">{p.portfolioConflicts ?? "None identified."}</KV>
      </Card>
      {p.historicalPrecedents?.length > 0 && (
        <Card>
          <SectionTitle eyebrow="Deal archive" title="Genesys precedents applied" />
          <div className="divide-y divide-line">
            {p.historicalPrecedents.map((h, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 py-4 first:pt-0 md:grid-cols-[220px_1fr]">
                <div>
                  <div className="font-display font-semibold text-[17px] text-navy-900">{h.company}</div>
                  <div className="text-[12px] text-muted">{h.genesysDecision}</div>
                </div>
                <p className="text-[13.5px] leading-relaxed text-ink-soft"><Tagged text={h.relevance} /></p>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card>
        <SectionTitle eyebrow="Institutional memory" title="Comparable Genesys investments" />
        {p.comparableGenesysInvestments.length === 0 ? (
          <p className="text-[14px] text-muted">No close analogues in the Genesys portfolio.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {p.comparableGenesysInvestments.map((c, i) => (
              <div key={i} className="border-l-2 border-brand-500 pl-5">
                <div className="font-display font-semibold text-[19px] text-navy-900">{c.company}</div>
                <p className="mt-1 text-[13.5px] text-ink-soft"><span className="text-muted">Similarity: </span>{c.similarity}</p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink"><span className="text-muted">Lesson: </span><Tagged text={c.lesson} /></p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const PRI: Record<string, { label: string; cls: string }> = {
  CRITICAL: { label: "Critical", cls: "bg-neg-bg text-neg" },
  IMPORTANT: { label: "Important", cls: "bg-warn-bg text-warn" },
  SUPPLEMENTARY: { label: "Supplementary", cls: "bg-navy-50 text-navy-700" },
};

export function RequestsView({ memo }: { memo: Memo }) {
  const groups = ["CRITICAL", "IMPORTANT", "SUPPLEMENTARY"] as const;
  if (!memo.informationRequests.length) {
    return <Card><p className="text-[14px] text-muted">No outstanding information requests.</p></Card>;
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const items = memo.informationRequests.filter((r) => r.priority === g);
        if (!items.length) return null;
        return (
          <Card key={g} pad={false}>
            <div className="flex items-center gap-3 border-b border-line px-6 py-4">
              <Pill cls={PRI[g].cls}>{PRI[g].label}</Pill>
              <span className="text-[13px] text-muted">{items.length} item{items.length === 1 ? "" : "s"}</span>
            </div>
            <ol className="divide-y divide-line">
              {items.map((r, i) => (
                <li key={i} className="grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[160px_1fr]">
                  <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">{r.category}</div>
                  <div>
                    <p className="text-[14px] font-medium leading-relaxed text-ink"><Tagged text={r.request} /></p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-soft"><Tagged text={r.rationale} /></p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        );
      })}
    </div>
  );
}

export function DiligenceView({ memo }: { memo: Memo }) {
  const plan = memo.dueDiligencePlan;
  if (!plan) {
    return (
      <Card className="text-center">
        <div className="mx-auto max-w-lg py-8">
          <div className="eyebrow mb-3">Not issued</div>
          <h3 className="font-display font-semibold text-[22px] text-navy-900">Diligence requirements are issued only when a deal passes screening.</h3>
          <p className="mt-3 text-[14px] text-ink-soft">
            {memo.recommendation === "PENDING_INFO"
              ? "This deal is awaiting further information from the founders. Once received, reopen it to re-run the analysis."
              : "The Sharminator recommended declining this opportunity."}
          </p>
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-8">
      <Card className="bg-brand-gradient !border-transparent text-white">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="eyebrow !text-white/80">Due-diligence programme</div>
            <div className="mt-2 font-display font-semibold text-[28px]">{plan.workstreams.length} workstreams · ~{plan.estimatedTotalWeeks} weeks</div>
          </div>
        </div>
        <div className="mt-6">
          <div className="eyebrow mb-3 !text-white/70">Critical questions for Investment Committee</div>
          <ol className="space-y-2.5">
            {plan.criticalQuestionsForIC.map((q, i) => (
              <li key={i} className="flex gap-4 text-[14px] leading-relaxed text-white/85">
                <span className="font-display font-semibold text-white tabular">{String(i + 1).padStart(2, "0")}</span>
                {q}
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {plan.workstreams.map((w, i) => (
          <Card key={i}>
            <div className="flex items-start justify-between gap-4">
              <h4 className="font-display font-semibold text-[19px] text-navy-900">{w.name}</h4>
              <span className="shrink-0 rounded-full bg-navy-50 px-2.5 py-0.5 text-[11.5px] tabular text-navy-700">{w.durationWeeks} wks</span>
            </div>
            <p className="mt-1.5 text-[13.5px] text-ink-soft">{w.objective}</p>
            <ul className="mt-4 space-y-1.5">
              {w.tasks.map((t, k) => (
                <li key={k} className="flex gap-2.5 text-[13.5px] text-ink">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand-500" />
                  {t}
                </li>
              ))}
            </ul>
            {w.externalExperts.length > 0 && (
              <div className="mt-4 border-t border-line pt-3 text-[12.5px] text-muted">
                <span className="font-medium text-ink-soft">Experts: </span>{w.externalExperts.join("; ")}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card>
        <SectionTitle eyebrow="Data room" title="Document request list" />
        <ol className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
          {plan.documentRequestList.map((d, i) => (
            <li key={i} className="flex gap-3 text-[13.5px] text-ink-soft">
              <span className="w-6 shrink-0 text-right tabular text-muted">{i + 1}.</span>
              {d}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

const money = (m: number | null | undefined) => (m == null ? "n/a" : m >= 1000 ? `US$${(m / 1000).toFixed(1)}B` : `US$${Math.round(m)}M`);

export function MarketView({ memo }: { memo: Memo }) {
  const m = memo.market;
  const ms = m.marketSizing;
  return (
    <div className="space-y-8">
      {ms && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
          {[
            ["Total market (TAM)", money(ms.tamUsdM), "Bottom-up"],
            ["Serviceable (SAM)", money(ms.samUsdM), "Reachable with this product"],
            ["Peak sales, base", money(ms.peakSalesUsdM.base), `Range ${money(ms.peakSalesUsdM.low)} to ${money(ms.peakSalesUsdM.high)}`],
            ["Pricing analogues", m.pricingAnalogues?.length ?? 0, "Named comparators"],
          ].map(([k, v, n]) => (
            <div key={k as string} className="bg-paper px-6 py-5">
              <div className="eyebrow">{k}</div>
              <div className="mt-2 font-display font-semibold text-[30px] leading-none tabular text-navy-900">{v}</div>
              <div className="mt-2 text-[12px] text-muted">{n}</div>
            </div>
          ))}
        </div>
      )}
      <Card>
        <SectionTitle eyebrow="Market" title="Need and standard of care" />
        <KV label="Conclusion">{m.addressableMarket}</KV>
        <KV label="Unmet need">{m.unmetNeed}</KV>
        {m.standardOfCare && <KV label="Standard of care">{m.standardOfCare}</KV>}
        {m.marketTiming && <KV label="Timing">{m.marketTiming}</KV>}
      </Card>
      {m.patientPopulation?.length > 0 && (
        <Card>
          <SectionTitle eyebrow="Epidemiology" title="Patient population" />
          <div className="overflow-x-auto">
          <table className="stack-sm w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="py-2 pr-4 font-semibold">Segment</th>
                <th className="px-4 py-2 font-semibold">Geography</th>
                <th className="px-4 py-2 font-semibold">Patients</th>
                <th className="py-2 pl-4 font-semibold">Basis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {m.patientPopulation.map((p, i) => (
                <tr key={i}>
                  <td data-label="Segment" className="py-3 pr-4 text-ink">{p.segment}</td>
                  <td data-label="Geography" className="px-4 py-3 text-ink-soft">{p.geography}</td>
                  <td data-label="Patients" className="px-4 py-3 font-display font-semibold text-[16px] tabular text-navy-900">{p.value}</td>
                  <td data-label="Basis" className="py-3 pl-4 text-[12.5px] text-ink-soft"><Tagged text={p.basis} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
      {ms && (
        <Card>
          <SectionTitle eyebrow="Sizing" title="Bottom-up market model" />
          <KV label="Method">{ms.method}</KV>
          <KV label="Assumptions"><Bullets items={ms.assumptions} /></KV>
          <KV label="Versus the deck">{ms.deckClaimCritique}</KV>
        </Card>
      )}
      {m.pricingAnalogues?.length > 0 && (
        <Card>
          <SectionTitle eyebrow="Pricing" title="Analogues" />
          <div className="overflow-x-auto">
          <table className="stack-sm w-full text-left text-[13.5px]">
            <tbody className="divide-y divide-line">
              {m.pricingAnalogues.map((p, i) => (
                <tr key={i}>
                  <td className="py-3 pr-4 font-medium text-navy-900">{p.product}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular text-ink">{p.price}</td>
                  <td className="py-3 pl-4 text-ink-soft"><Tagged text={p.relevance} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
      <Card>
        <SectionTitle eyebrow="Access" title="Reimbursement and adoption" />
        <KV label="Reimbursement">{m.reimbursementAndAccess}</KV>
        {m.adoptionBarriers && <KV label="Adoption barriers"><Bullets items={m.adoptionBarriers} /></KV>}
        <KV label="Likely acquirers">
          <div className="flex flex-wrap gap-2">
            {m.likelyAcquirers.map((a) => (
              <span key={a} className="rounded-full border border-line-strong px-3 py-1 text-[12.5px] text-ink-soft">{a}</span>
            ))}
          </div>
        </KV>
      </Card>
    </div>
  );
}

const IP_STATUS: Record<string, string> = {
  GRANTED: "bg-pos-bg text-pos",
  PENDING: "bg-warn-bg text-warn",
  PCT: "bg-warn-bg text-warn",
  PROVISIONAL: "bg-warn-bg text-warn",
  LAPSED: "bg-neg-bg text-neg",
  UNKNOWN: "bg-[#f1efea] text-muted",
};

export function IPView({ memo }: { memo: Memo }) {
  const ip = memo.intellectualProperty;
  return (
    <div className="space-y-8">
      <Card>
        <SectionTitle
          eyebrow="Intellectual property"
          title="IP position"
          action={ip.strength ? <span className={cx("rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em]", ip.strength === "STRONG" ? "bg-pos-bg text-pos" : ip.strength === "ADEQUATE" ? "bg-navy-50 text-navy-700" : ip.strength === "WEAK" ? "bg-neg-bg text-neg" : "bg-warn-bg text-warn")}>{ip.strength.toLowerCase()}</span> : undefined}
        />
        <Paras text={ip.position} />
      </Card>
      {ip.assets && (
        <Card pad={false}>
          <div className="px-6 pt-6"><SectionTitle eyebrow="Inventory" title="Patents and applications" /></div>
          {ip.assets.length === 0 ? (
            <p className="px-6 pb-6 text-[14px] text-muted">No patents or applications were identified in the materials or the IP research.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="stack-sm w-full text-left text-[13px]">
              <thead>
                <tr className="border-y border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                  <th className="py-2.5 pr-3 pl-6 font-semibold">Identifier</th>
                  <th className="px-3 py-2.5 font-semibold">Title and type</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Owner</th>
                  <th className="py-2.5 pr-6 pl-3 font-semibold">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ip.assets.map((a, i) => (
                  <tr key={i}>
                    <td data-label="Identifier" className="py-3 pr-3 pl-6 align-top font-mono text-[12px] text-navy-900">{a.identifier}</td>
                    <td data-label="Title and type" className="px-3 py-3 align-top">
                      <div className="text-ink">{a.title}</div>
                      <div className="text-[11.5px] text-muted">{a.type.replaceAll("_", " ").toLowerCase()}{a.jurisdictions ? ` · ${a.jurisdictions}` : ""}</div>
                    </td>
                    <td data-label="Status" className="px-3 py-3 align-top"><span className={cx("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", IP_STATUS[a.status])}>{a.status.toLowerCase()}</span></td>
                    <td data-label="Owner" className="px-3 py-3 align-top text-ink-soft">{a.ownerOrAssignee ?? "Unknown"}</td>
                    <td data-label="Expiry" className="py-3 pr-6 pl-3 align-top text-ink-soft">{a.estimatedExpiry ?? "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      )}
      <Card>
        <SectionTitle eyebrow="Analysis" title="Ownership, freedom to operate and exclusivity" />
        {ip.ownershipAndLicensing && <KV label="Ownership and licensing">{ip.ownershipAndLicensing}</KV>}
        {ip.freedomToOperate && <KV label="Freedom to operate">{ip.freedomToOperate}</KV>}
        {ip.exclusivityRunway && <KV label="Exclusivity runway">{ip.exclusivityRunway}</KV>}
        {ip.tradeSecretsAndKnowHow && <KV label="Trade secrets and know-how">{ip.tradeSecretsAndKnowHow}</KV>}
        <KV label="Concerns"><Bullets items={ip.concerns} /></KV>
        {ip.diligenceSteps && <KV label="IP diligence required"><Bullets items={ip.diligenceSteps} /></KV>}
      </Card>
    </div>
  );
}

const VERIF: Record<string, { label: string; cls: string }> = {
  VERIFIED: { label: "Verified", cls: "bg-pos-bg text-pos" },
  PARTIALLY_VERIFIED: { label: "Partly verified", cls: "bg-warn-bg text-warn" },
  UNVERIFIED: { label: "Unverified", cls: "bg-neg-bg text-neg" },
};

export function TeamView({ memo }: { memo: Memo }) {
  const t = memo.team;
  return (
    <div className="space-y-8">
      <Card>
        <SectionTitle eyebrow="People" title="Founders and management" />
        <Paras text={t.assessment} />
        {t.founderMarketFit && <div className="mt-5"><KV label="Founder-market fit">{t.founderMarketFit}</KV></div>}
      </Card>
      {t.members?.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {t.members.map((p, i) => (
            <Card key={i}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-display font-semibold text-[20px] text-navy-900">{p.name}</h4>
                  <div className="text-[12.5px] text-muted">{p.role}</div>
                </div>
                <span className={cx("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", VERIF[p.verification].cls)}>{VERIF[p.verification].label}</span>
              </div>
              <dl className="mt-4 space-y-3 text-[13px]">
                {[
                  ["Background", p.background],
                  ["Relevant experience", p.relevantExperience],
                  ["Prior ventures", p.priorVentures],
                  ["Commitment", p.commitment],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="eyebrow mb-0.5">{k}</dt>
                    <dd className="leading-relaxed text-ink-soft"><Tagged text={v} /></dd>
                  </div>
                ))}
                {p.concerns && (
                  <div className="rounded-lg bg-neg-bg/60 px-3 py-2">
                    <dt className="eyebrow mb-0.5 text-neg">Concerns</dt>
                    <dd className="leading-relaxed text-ink"><Tagged text={p.concerns} /></dd>
                  </div>
                )}
              </dl>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <SectionTitle eyebrow="Organisation" title="Board, gaps and next hires" />
        {t.boardAndAdvisors && <KV label="Board and advisors">{t.boardAndAdvisors}</KV>}
        <KV label="Strengths"><Bullets items={t.strengths} marker="+" /></KV>
        <KV label="Gaps"><Bullets items={t.gaps} marker="○" /></KV>
        {t.hiringPriorities && <KV label="Hiring priorities"><Bullets items={t.hiringPriorities} /></KV>}
        {t.referenceChecks && <KV label="Reference checks"><Bullets items={t.referenceChecks} /></KV>}
      </Card>
    </div>
  );
}

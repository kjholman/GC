import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { BacktestMetrics } from "@/lib/training/engine";
import { Card, REC_META, SectionTitle, cx } from "@/components/ui";
import { AutoRefresh } from "./AutoRefresh";


const DEC_LABEL: Record<string, string> = {
  INVESTED: "Invested",
  PASSED_AFTER_DILIGENCE: "Passed after diligence",
  PASSED_AT_SCREENING: "Declined at screen",
};

export default async function BacktestRunPage({ params }: PageProps<"/training/backtests/[id]">) {
  const { id } = await params;
  const run = await db.backtestRun.findUnique({
    where: { id },
    include: { results: { include: { historicalDeal: { select: { companyName: true, decisionYear: true, decision: true, outcome: true, decisionRationale: true } } }, orderBy: { createdAt: "asc" } } },
  });
  if (!run) notFound();
  const m = run.metrics as BacktestMetrics | null;
  const running = run.status === "RUNNING" || run.status === "QUEUED";

  return (
    <div className="space-y-8">
      {running && <AutoRefresh />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/training/backtests" className="text-[13px] text-muted hover:text-navy-800">← All accuracy tests</Link>
          <h2 className="mt-2 font-display font-semibold text-[28px] text-navy-900">{run.label}</h2>
        </div>
        {running && (
          <div className="w-72">
            <div className="mb-1 flex justify-between text-[12px] text-muted"><span>Re-screening past deals…</span><span className="tabular">{run.completed}/{run.total}</span></div>
            <div className="h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(run.completed / Math.max(1, run.total)) * 100}%` }} /></div>
          </div>
        )}
        {run.error && <p className="text-[13px] text-neg">{run.error}</p>}
      </div>

      {m && (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
            {[
              ["Agreement with partners", `${Math.round(m.agreement * 100)}%`, `${m.scored} deals scored`],
              ["Missed winners", m.missedWinners.length, "Successful exits it would have declined"],
              ["False advances", m.falseAdvances.length, "Deals Genesys declined that it would have advanced"],
              ["Leaning", m.bias, `Mean score: pursued ${m.meanScoreByExpected.PURSUE} · declined ${m.meanScoreByExpected.DECLINE}`],
            ].map(([k, v, n]) => (
              <div key={k as string} className="bg-paper px-6 py-5">
                <div className="eyebrow">{k}</div>
                <div className="mt-2 font-display font-semibold text-[34px] leading-none tabular capitalize text-navy-900">{v}</div>
                <div className="mt-2 text-[12px] text-muted">{n}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Card>
              <SectionTitle eyebrow="Side by side" title="Genesys decision vs the Sharminator's call" />
              <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.1em] text-muted">
                    <th className="py-2 text-left font-semibold">Genesys</th>
                    <th className="py-2 text-right font-semibold">Sharminator: decline</th>
                    <th className="py-2 text-right font-semibold">Request info</th>
                    <th className="py-2 text-right font-semibold">Advance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {Object.entries(m.confusion).map(([dec, row]) => (
                    <tr key={dec}>
                      <td className="py-2.5 text-ink">{DEC_LABEL[dec]}</td>
                      {(["REJECT", "PENDING_INFO", "ADVANCE_TO_DILIGENCE"] as const).map((r) => {
                        const good = dec === "PASSED_AT_SCREENING" ? r === "REJECT" : r !== "REJECT";
                        return <td key={r} className={cx("py-2.5 text-right font-display font-semibold text-[18px] tabular", row[r] ? (good ? "text-pos" : "text-neg") : "text-line-strong")}>{row[r]}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Card>
            <Card>
              <SectionTitle eyebrow="By sector" title="Where judgement is strongest" />
              <ul className="space-y-3">
                {m.bySector.map((s) => (
                  <li key={s.sector} className="flex items-center gap-4 text-[13px]">
                    <span className="w-40 shrink-0 text-ink">{s.sector}</span>
                    <div className="h-2 flex-1 rounded-full bg-line"><div className="h-2 rounded-full bg-navy-800" style={{ width: `${s.agreement * 100}%` }} /></div>
                    <span className="w-20 text-right tabular text-muted">{Math.round(s.agreement * 100)}% · {s.n}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}

      <Card pad={false}>
        <div className="px-6 pt-6"><SectionTitle eyebrow="Case by case" title="Re-screened deals" /></div>
        <ul className="divide-y divide-line border-t border-line">
          {run.results.map((r) => (
            <li key={r.id} className="px-6 py-4">
              <div className="flex flex-wrap items-center gap-4">
                <span className={cx("h-2.5 w-2.5 rounded-full", r.agree == null ? "bg-line-strong" : r.agree ? "bg-pos" : "bg-neg")} />
                <span className="min-w-0 flex-1 font-medium text-navy-900">{r.historicalDeal.companyName} <span className="text-[12px] font-normal text-muted">{r.historicalDeal.decisionYear}</span></span>
                <span className="text-[12.5px] text-muted">Genesys: {DEC_LABEL[r.historicalDeal.decision]} · {r.historicalDeal.outcome.toLowerCase().replace("_", " ")}</span>
                <span className={cx("w-44 text-right text-[13px] font-medium", r.aiRecommendation ? REC_META[r.aiRecommendation]?.cls : "text-muted")}>
                  {r.error ? <span className="text-neg">error</span> : r.aiRecommendation ? `${REC_META[r.aiRecommendation]?.label} · ${r.aiScore}` : "pending"}
                </span>
              </div>
              {r.memo && r.agree === false && (
                <div className="mt-3 grid grid-cols-1 gap-4 pl-6 text-[12.5px] md:grid-cols-2">
                  <p className="text-ink-soft"><span className="text-muted">Sharminator&rsquo;s reasoning: </span>{(r.memo as { worthOurTime?: { headline?: string } }).worthOurTime?.headline}</p>
                  <p className="text-ink-soft"><span className="text-muted">Partners at the time: </span>{r.historicalDeal.decisionRationale}</p>
                </div>
              )}
              {r.error && <p className="mt-2 pl-6 text-[12px] text-neg">{r.error}</p>}
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-[12px] leading-relaxed text-muted">
        Note: for well-known companies, the Sharminator may already know how things turned out, which flatters its score on famous deals. Judge it mainly on lesser-known ones.
      </p>
    </div>
  );
}

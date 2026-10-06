import Link from "next/link";
import { db } from "@/lib/db";
import type { BacktestMetrics } from "@/lib/training/engine";
import { Button, Card, SectionTitle, cx, fmtDate } from "@/components/ui";


const FINE_TUNE_THRESHOLD = 300;

export default async function TrainingOverview() {
  const [archive, archiveWithDecks, exemplars, feedback, principles, lastRun, runs] = await Promise.all([
    db.historicalDeal.count({ where: { ingestStatus: "READY" } }),
    db.historicalDeal.count({ where: { ingestStatus: "READY", deckData: { not: null } } }),
    db.exemplar.count({ where: { active: true } }),
    db.analysisFeedback.count(),
    db.investmentPrinciple.count({ where: { active: true } }),
    db.backtestRun.findFirst({ where: { status: "COMPLETE" }, orderBy: { completedAt: "desc" } }),
    db.backtestRun.findMany({ where: { status: "COMPLETE" }, orderBy: { completedAt: "asc" }, take: 12 }),
  ]);
  const m = lastRun?.metrics as BacktestMetrics | undefined;
  const datasetSize = archive + exemplars + feedback;

  const levers = [
    { href: "/training/archive", n: archive, label: "Past deals", hint: "Used as precedents for similar new deals.", target: 100 },
    { href: "/training/exemplars", n: exemplars, label: "Example memos", hint: "Corrected memos the Sharminator learns from.", target: 20 },
    { href: "/training/calibration", n: feedback, label: "Partner reviews", hint: "Feedback applied to every analysis.", target: 50 },
    { href: "/knowledge", n: principles, label: "Investment principles", hint: "The firm's rules, applied to every memo.", target: 10 },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <SectionTitle eyebrow="Judgement" title="How often it agrees with Genesys" />
          {m ? (
            <>
              <div className="flex flex-wrap items-end gap-10">
                <div>
                  <div className="font-display font-semibold text-[56px] leading-none tabular text-navy-900">{Math.round(m.agreement * 100)}%</div>
                  <div className="mt-2 text-[12.5px] text-muted">of {m.scored} replayed deals · {lastRun!.label} · {fmtDate(lastRun!.completedAt)}</div>
                </div>
                <div className="text-[13px] text-ink-soft">
                  <div>Leaning: <span className={cx("font-medium", m.bias === "balanced" ? "text-pos" : "text-warn")}>{m.bias}</span></div>
                  <div className="mt-1">Missed winners: <span className="font-medium text-ink">{m.missedWinners.length}</span></div>
                  <div className="mt-1">False advances: <span className="font-medium text-ink">{m.falseAdvances.length}</span></div>
                </div>
              </div>
              {runs.length > 1 && (
                <div className="mt-8">
                  <div className="eyebrow mb-3">Trend across tests</div>
                  <div className="flex h-24 items-end gap-2">
                    {runs.map((r) => {
                      const a = (r.metrics as BacktestMetrics | null)?.agreement ?? 0;
                      return (
                        <Link key={r.id} href={`/training/backtests/${r.id}`} title={`${r.label}: ${Math.round(a * 100)}%`} className="flex flex-1 flex-col items-center gap-1">
                          <div className="w-full max-w-10 rounded-t-[2px] bg-navy-800 hover:bg-brand-500" style={{ height: `${Math.max(4, a * 96)}px` }} />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-[14px] text-ink-soft">
              No accuracy tests yet. Add past deals with their original decks to the archive. Then run an accuracy test to see how often the Sharminator reaches the same decision the partners did.
              <div className="mt-5">
                <Link href={archiveWithDecks ? "/training/backtests" : "/training/archive"}>
                  <Button variant="secondary">{archiveWithDecks ? "Run the first accuracy test" : "Add past deals"}</Button>
                </Link>
              </div>
            </div>
          )}
        </Card>

        <Card className="bg-brand-gradient !border-transparent text-white">
          <div className="eyebrow !text-white/80">Training data collected</div>
          <div className="mt-3 font-display font-semibold text-[40px] leading-none tabular">{datasetSize}<span className="text-[18px] text-white/50"> / {FINE_TUNE_THRESHOLD}</span></div>
          <div className="mt-2 text-[12.5px] text-white/60">examples so far (past deals, example memos and partner reviews)</div>
          <div className="mt-5 h-1.5 rounded-full bg-white/10">
            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${Math.min(100, (datasetSize / FINE_TUNE_THRESHOLD) * 100)}%` }} />
          </div>
          <p className="mt-5 text-[12.5px] leading-relaxed text-white/65">
            At about {FINE_TUNE_THRESHOLD} examples, there is enough to train Genesys&rsquo;s own AI model to give a second opinion alongside the Sharminator.
          </p>
          <a href="/api/training/export" className="mt-5 inline-block text-[13px] text-white underline underline-offset-4 hover:text-white">
            Download the training data
          </a>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {levers.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="h-full transition-shadow hover:shadow-[var(--shadow-lift)]">
              <div className="eyebrow">{l.label}</div>
              <div className="mt-2 font-display font-semibold text-[36px] leading-none tabular text-navy-900">{l.n}</div>
              <div className="mt-3 h-1 rounded-full bg-line">
                <div className="h-1 rounded-full bg-brand-500" style={{ width: `${Math.min(100, (l.n / l.target) * 100)}%` }} />
              </div>
              <div className="mt-3 text-[12.5px] text-muted">{l.hint} Suggested: {l.target}+.</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { db } from "@/lib/db";
import type { BacktestMetrics } from "@/lib/training/engine";
import { Button, Card, SectionTitle, cx, fmtDate } from "@/components/ui";
import { FIRM_SETTINGS } from "@/lib/training/settings";


export default async function TrainingOverview() {
  const [archive, archiveWithDecks, exemplars, feedback, principles, lastRun, runs, finishedMemos, settingsSaved, stagesOpen] = await Promise.all([
    db.historicalDeal.count({ where: { ingestStatus: "READY" } }),
    db.historicalDeal.count({ where: { ingestStatus: "READY", deckData: { not: null } } }),
    db.exemplar.count({ where: { active: true } }),
    db.analysisFeedback.count(),
    db.investmentPrinciple.count({ where: { active: true } }),
    db.backtestRun.findFirst({ where: { status: "COMPLETE" }, orderBy: { completedAt: "desc" } }),
    db.backtestRun.findMany({ where: { status: "COMPLETE" }, orderBy: { completedAt: "asc" }, take: 12 }),
    db.analysis.count({ where: { status: "COMPLETE" } }),
    db.firmSetting.count({ where: { key: { in: FIRM_SETTINGS.map((x) => x.key) } } }),
    db.fundingStage.count({ where: { confirmed: false } }),
  ]);
  const m = lastRun?.metrics as BacktestMetrics | undefined;
  // Targets sized for a firm of Genesys's scale: enough to matter, reachable in a few sittings.
  const levers = [
    { href: "/training/archive", n: archive, label: "Past deals", hint: "Precedents GAIA compares new deals with, including deals Genesys passed on.", target: 40 },
    { href: "/training/exemplars", n: exemplars, label: "Example memos", hint: "Memos the partners corrected, showing GAIA the standard.", target: 8 },
    { href: "/training/calibration", n: feedback, label: "Partner reviews", hint: "Each review becomes a lesson applied to every analysis.", target: 25 },
    { href: "/knowledge#principles", n: principles, label: "Investment principles", hint: "The firm's rules, applied to every memo.", target: 8 },
  ];
  // The next most useful things to do, in order.
  const steps = [
    settingsSaved < FIRM_SETTINGS.length && { href: "/training/prompt", text: `Confirm the firm settings (${settingsSaved} of ${FIRM_SETTINGS.length} done): cheque size, mandate, return hurdle` },
    stagesOpen > 0 && { href: "/training/stages", text: `Confirm the funding stage playbook (${stagesOpen} stage${stagesOpen === 1 ? "" : "s"} still on starting values): cheque, round size, valuation and milestones by stage` },
    archive < 40 && { href: "/training/archive", text: `Add past deals (${archive} so far): download the template, list deals you invested in and passed on, and why` },
    archiveWithDecks < Math.min(15, archive) && { href: "/training/backtests", text: `Attach original decks to past deals (${archiveWithDecks} have one) so accuracy tests can run` },
    archiveWithDecks >= 5 && !lastRun && { href: "/training/backtests", text: "Run the first accuracy test to see how often GAIA agrees with the partners" },
    exemplars < 8 && finishedMemos > 0 && { href: "/training/exemplars", text: `Correct a finished memo into an example memo (${exemplars} so far)` },
    feedback < 25 && finishedMemos > 0 && { href: "/deals", text: `Review finished memos (${feedback} reviews so far); each becomes a lesson` },
    principles < 8 && { href: "/knowledge#principles", text: `Record the partnership's investment principles (${principles} so far)` },
  ].filter(Boolean) as { href: string; text: string }[];

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
              No accuracy tests yet. Add past deals with their original decks to the archive. Then run an accuracy test to see how often GAIA reaches the same decision the partners did.
              <div className="mt-5">
                <Link href={archiveWithDecks ? "/training/backtests" : "/training/archive"}>
                  <Button variant="secondary">{archiveWithDecks ? "Run the first accuracy test" : "Add past deals"}</Button>
                </Link>
              </div>
            </div>
          )}
        </Card>

        <Card className="bg-brand-gradient !border-transparent text-white">
          <div className="eyebrow !text-white/80">What to do next</div>
          {steps.length ? (
            <ol className="mt-3 space-y-2.5 text-[13.5px] leading-snug">
              {steps.slice(0, 4).map((st, i) => (
                <li key={st.href + i} className="flex gap-2.5">
                  <span className="font-display font-semibold text-brand-300 tabular">{i + 1}</span>
                  <Link href={st.href} className="text-white hover:underline">{st.text}</Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-[13.5px] text-white/80">GAIA has everything it needs. Keep reviewing memos and re-run an accuracy test after big changes.</p>
          )}
          <a href="/api/training/export" className="mt-6 inline-block text-[12px] text-white/70 underline underline-offset-4 hover:text-white">
            Download all training data
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
              <div className="mt-3 text-[12.5px] text-muted">{l.hint} {l.n >= l.target ? "Good coverage." : `Aim for ${l.target}.`}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

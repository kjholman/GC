import Link from "next/link";
import { db } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth/session";
import type { BacktestMetrics } from "@/lib/training/engine";
import { Card, Empty, SectionTitle, cx, fmtDate } from "@/components/ui";
import { StartBacktestForm } from "./StartBacktestForm";

export const metadata = { title: "Backtests" };

export default async function BacktestsPage() {
  const user = await requireUser();
  const canRun = hasRole(user.role, "PARTNER");
  const [runs, eligible] = await Promise.all([
    db.backtestRun.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.historicalDeal.count({ where: { ingestStatus: "READY", deckData: { not: null } } }),
  ]);
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <p className="mb-6 max-w-3xl text-[14px] leading-relaxed text-ink-soft">
          A backtest replays the analyst on past deals using only the original decks. It never sees the internal memo or the decision, and it may only consult precedents from earlier years. Its call is then compared with what Genesys actually did. Re-run a backtest after changing principles, exemplars or parameters to see whether the change helped.
        </p>
        {runs.length === 0 ? (
          <Empty title="No backtests yet">{eligible ? "Start one from the panel." : "Add past deals with their original decks to the archive first."}</Empty>
        ) : (
          <Card pad={false}>
            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                  <th className="py-3 pr-4 pl-6 font-semibold">Run</th>
                  <th className="px-4 py-3 font-semibold">Training state</th>
                  <th className="px-4 py-3 text-right font-semibold">Agreement</th>
                  <th className="px-4 py-3 font-semibold">Bias</th>
                  <th className="py-3 pr-6 pl-4 text-right font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => {
                  const m = r.metrics as BacktestMetrics | null;
                  const c = r.config as { principles: number; exemplars: number; archive: number; feedback: number };
                  return (
                    <tr key={r.id} className="hover:bg-ivory/70">
                      <td className="py-3.5 pr-4 pl-6">
                        <Link href={`/training/backtests/${r.id}`} className="font-medium text-navy-900 hover:underline">{r.label}</Link>
                        <div className="text-[12px] text-muted">{r.status === "COMPLETE" ? `${r.total} deals` : `${r.status.toLowerCase()} · ${r.completed}/${r.total}`}</div>
                      </td>
                      <td className="px-4 py-3.5 text-[12px] text-muted">{c.principles} principles · {c.exemplars} exemplars · {c.archive} archived · {c.feedback} reviews</td>
                      <td className="px-4 py-3.5 text-right font-serif text-[20px] tabular text-navy-900">{m ? `${Math.round(m.agreement * 100)}%` : "—"}</td>
                      <td className={cx("px-4 py-3.5 text-[12.5px]", m?.bias === "balanced" ? "text-pos" : "text-warn")}>{m?.bias ?? ""}</td>
                      <td className="py-3.5 pr-6 pl-4 text-right text-[12px] text-muted">{fmtDate(r.createdAt, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
      {canRun && (
        <div>
          <Card>
            <SectionTitle eyebrow="New run" title="Run a backtest" />
            <StartBacktestForm eligible={eligible} />
          </Card>
        </div>
      )}
    </div>
  );
}

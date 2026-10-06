import Link from "next/link";
import { db } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth/session";
import type { BacktestMetrics } from "@/lib/training/engine";
import { Card, Empty, SectionTitle, cx, fmtDate } from "@/components/ui";
import { StartBacktestForm } from "./StartBacktestForm";
import { Pagination, pageParam } from "@/components/Pagination";


export default async function BacktestsPage({ searchParams }: PageProps<"/training/backtests">) {
  const page = pageParam((await searchParams).page);
  const PAGE = 20;
  const user = await requireUser();
  const canRun = hasRole(user.role, "PARTNER");
  const [runs, runTotal, eligible] = await Promise.all([
    db.backtestRun.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.backtestRun.count(),
    db.historicalDeal.count({ where: { ingestStatus: "READY", deckData: { not: null } } }),
  ]);
  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <p className="mb-6 max-w-3xl text-[14px] leading-relaxed text-ink-soft">
          An accuracy test has the Sharminator re-screen past deals using only the original decks. It never sees the partners&rsquo; memo or decision, and only looks at precedents from earlier years. Its calls are then compared with what Genesys actually decided. Run another test after changing principles, example memos or firm settings to see whether the change helped.
        </p>
        {runs.length === 0 ? (
          <Empty title="No accuracy tests yet">{eligible ? "Start one from the panel on the right." : "First add past deals with their original decks under Past deals."}</Empty>
        ) : (
          <Card pad={false}>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                  <th className="py-3 pr-4 pl-6 font-semibold">Test</th>
                  <th className="px-4 py-3 font-semibold">What it knew</th>
                  <th className="px-4 py-3 text-right font-semibold">Agreement</th>
                  <th className="px-4 py-3 font-semibold">Leaning</th>
                  <th className="py-3 pr-6 pl-4 text-right font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => {
                  const m = r.metrics as BacktestMetrics | null;
                  const c = r.config as { principles: number; exemplars: number; archive: number; feedback: number };
                  return (
                    <tr key={r.id} className="hover:bg-mist/70">
                      <td className="py-3.5 pr-4 pl-6">
                        <Link href={`/training/backtests/${r.id}`} className="font-medium text-navy-900 hover:underline">{r.label}</Link>
                        <div className="text-[12px] text-muted">{r.status === "COMPLETE" ? `${r.total} deals` : `${r.status.toLowerCase()} · ${r.completed}/${r.total}`}</div>
                      </td>
                      <td className="px-4 py-3.5 text-[12px] text-muted">{c.principles} principles · {c.exemplars} example memos · {c.archive} past deals · {c.feedback} reviews</td>
                      <td className="px-4 py-3.5 text-right font-display font-semibold text-[20px] tabular text-navy-900">{m ? `${Math.round(m.agreement * 100)}%` : "n/a"}</td>
                      <td className={cx("px-4 py-3.5 text-[12.5px]", m?.bias === "balanced" ? "text-pos" : "text-warn")}>{m?.bias ?? ""}</td>
                      <td className="py-3.5 pr-6 pl-4 text-right text-[12px] text-muted">{fmtDate(r.createdAt, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div className="border-t border-line px-5"><Pagination page={page} pageSize={PAGE} total={runTotal} href={(p) => `/training/backtests?page=${p}`} /></div>
          </Card>
        )}
      </div>
      {canRun && (
        <div>
          <Card>
            <SectionTitle eyebrow="New test" title="Run an accuracy test" />
            <StartBacktestForm eligible={eligible} />
          </Card>
        </div>
      )}
    </div>
  );
}

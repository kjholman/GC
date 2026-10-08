import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { Card, PageHeader, SectionTitle, cx } from "@/components/ui";
import { formatUsd } from "@/lib/ai/usage";
import { Pagination } from "@/components/Pagination";
import { fmtDate } from "@/components/ui";

const PAGE_SIZE = 25;
type Txn = { key: string; at: Date; ended: Date; analysisId: string | null; purpose: string; requests: number; tokens: number; usd: number; dealId: string | null; slug: string | null; name: string | null; version: number | null; status: string | null; trigger: string | null };
const STATUS_LABEL: Record<string, string> = { COMPLETE: "Finished", FAILED: "Didn't finish", STOPPED: "Stopped", PAUSED: "Paused: out of credit", RUNNING: "Running", QUEUED: "Queued" };
const TRIGGER_LABEL: Record<string, string> = { INITIAL_SCREEN: "First screening", FOLLOW_UP: "New information", RERUN: "Re-run" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** AI spend: total, by deal, by purpose, by day and by model, for a chosen month or all time. */
export default async function CostsPage({ searchParams }: PageProps<"/administration/costs">) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const months = await db.$queryRaw<{ ym: string; usd: number }[]>`
    SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS ym, SUM("usd")::float AS usd
    FROM "AiUsage" GROUP BY 1 ORDER BY 1 DESC`;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : sp.month === "all" ? "all" : (months[0]?.ym ?? "all");
  const from = month === "all" ? new Date(0) : new Date(`${month}-01T00:00:00Z`);
  const to = month === "all" ? new Date("2999-01-01") : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));

  const page = Math.max(1, Number(sp.page) || 1);
  const [txnCount, txns] = await Promise.all([
    db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM (
        SELECT 1 FROM "AiUsage" WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
        GROUP BY COALESCE("analysisId", "purpose" || to_char("createdAt", 'YYYY-MM-DD'))) t`,
    db.$queryRaw<Txn[]>`
      SELECT COALESCE(u."analysisId", u."purpose" || to_char(u."createdAt", 'YYYY-MM-DD')) AS key,
             MIN(u."createdAt") AS at, MAX(u."createdAt") AS ended, u."analysisId",
             MIN(u."purpose") AS purpose, COUNT(*)::int AS requests,
             SUM(u."inputTokens" + u."outputTokens")::int AS tokens, SUM(u."usd")::float AS usd,
             d."id" AS "dealId", d."slug", d."companyName" AS name, a."version", a."status"::text AS status, a."trigger"::text AS trigger
      FROM "AiUsage" u
      LEFT JOIN "Analysis" a ON a."id" = u."analysisId"
      LEFT JOIN "Deal" d ON d."id" = a."dealId"
      WHERE u."createdAt" >= ${from} AND u."createdAt" < ${to}
      GROUP BY 1, u."analysisId", d."id", d."slug", d."companyName", a."version", a."status", a."trigger"
      ORDER BY at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
  ]);
  const [total, byPurpose, byModel, byDay, byDeal] = await Promise.all([
    db.aiUsage.aggregate({ where: { createdAt: { gte: from, lt: to } }, _sum: { usd: true, inputTokens: true, outputTokens: true }, _count: true }),
    db.aiUsage.groupBy({ by: ["purpose"], where: { createdAt: { gte: from, lt: to } }, _sum: { usd: true }, orderBy: { _sum: { usd: "desc" } } }),
    db.aiUsage.groupBy({ by: ["model"], where: { createdAt: { gte: from, lt: to } }, _sum: { usd: true }, orderBy: { _sum: { usd: "desc" } } }),
    db.$queryRaw<{ day: string; usd: number }[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, SUM("usd")::float AS usd
      FROM "AiUsage" WHERE "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1 ORDER BY 1 DESC LIMIT 62`,
    db.$queryRaw<{ id: string; slug: string | null; name: string; usd: number; runs: number }[]>`
      SELECT d."id", d."slug", d."companyName" AS name, SUM(u."usd")::float AS usd, COUNT(DISTINCT u."analysisId")::int AS runs
      FROM "AiUsage" u JOIN "Analysis" a ON a."id" = u."analysisId" JOIN "Deal" d ON d."id" = a."dealId"
      WHERE u."createdAt" >= ${from} AND u."createdAt" < ${to}
      GROUP BY d."id", d."slug", d."companyName" ORDER BY usd DESC LIMIT 100`,
  ]);
  const sum = total._sum.usd ?? 0;
  const maxDay = Math.max(0.01, ...byDay.map((d) => d.usd));
  const maxDeal = Math.max(0.01, ...byDeal.map((d) => d.usd));

  return (
    <>
      <PageHeader eyebrow="Administration" title="AI spend" subtitle="Everything GAIA has spent on Anthropic, measured from every request including web searches." />
      <div className="mb-6 flex flex-wrap items-center gap-2 text-[13px]">
        <Link href="/administration" className="mr-2 text-navy-700 hover:underline">← Administration</Link>
        {[{ ym: "all", usd: 0 }, ...months].map((m) => (
          <Link
            key={m.ym}
            href={`/administration/costs?month=${m.ym}`}
            className={cx("rounded-lg px-3 py-1.5", month === m.ym ? "bg-navy-900 text-white" : "text-ink-soft hover:bg-paper")}
          >
            {m.ym === "all" ? "All time" : monthLabel(m.ym)}
          </Link>
        ))}
      </div>

      <div className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        {[
          ["Total spend", formatUsd(sum)],
          ["Deals analysed", String(byDeal.length)],
          ["Average per deal", byDeal.length ? formatUsd(byDeal.reduce((n, d) => n + d.usd, 0) / byDeal.length) : "n/a"],
          ["AI requests", total._count.toLocaleString("en-CA")],
        ].map(([k, v]) => (
          <div key={k} className="bg-paper px-5 py-4">
            <div className="eyebrow">{k}</div>
            <div className="mt-1.5 font-display text-[26px] font-semibold tabular text-navy-900">{v}</div>
          </div>
        ))}
      </div>

      <Card pad={false} className="mb-8">
        <div className="px-6 pt-6">
          <SectionTitle eyebrow={month === "all" ? "All time" : monthLabel(month)} title="Transactions" />
          <p className="-mt-2 mb-4 text-[12.5px] text-muted">Each analysis run is one line. Background work (logo lookups, file summaries, feedback, credit checks) is grouped by day.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="border-y border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="py-3 pr-4 pl-6 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Deal</th>
                <th className="px-4 py-3 font-semibold">What</th>
                <th className="px-4 py-3 font-semibold">Result</th>
                <th className="px-4 py-3 text-right font-semibold">Requests</th>
                <th className="px-4 py-3 text-right font-semibold">Tokens</th>
                <th className="py-3 pr-6 pl-4 text-right font-semibold">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {txns.map((t) => (
                <tr key={t.key}>
                  <td className="py-3 pr-4 pl-6 whitespace-nowrap text-ink-soft">{t.analysisId ? fmtDate(t.at, true) : fmtDate(t.at)}</td>
                  <td className="px-4 py-3">
                    {t.dealId ? <Link href={`/deals/${t.slug ?? t.dealId}`} className="font-medium text-navy-900 hover:underline">{t.name}</Link> : <span className="text-muted">n/a</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {t.analysisId ? `Analysis ${t.version ?? ""}${t.trigger ? `: ${TRIGGER_LABEL[t.trigger] ?? t.trigger}` : ""}` : <span className="first-letter:uppercase">{t.purpose}</span>}
                    {t.analysisId && <span className="block text-[11.5px] text-muted">{Math.max(1, Math.round((new Date(t.ended).getTime() - new Date(t.at).getTime()) / 60000))} min of AI work</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{t.status ? (STATUS_LABEL[t.status] ?? t.status) : ""}</td>
                  <td className="px-4 py-3 text-right tabular text-ink-soft">{t.requests}</td>
                  <td className="px-4 py-3 text-right tabular text-muted">{t.tokens.toLocaleString("en-CA")}</td>
                  <td className="py-3 pr-6 pl-4 text-right tabular font-medium text-ink">{formatUsd(t.usd)}</td>
                </tr>
              ))}
              {!txns.length && <tr><td colSpan={7} className="px-6 py-5 text-muted">No spend in this period.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination className="px-5" page={page} pageSize={PAGE_SIZE} total={txnCount[0]?.n ?? 0} href={(p) => `/administration/costs?month=${month}&page=${p}`} />
      </Card>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card pad={false}>
          <div className="px-6 pt-6"><SectionTitle eyebrow={month === "all" ? "All time" : monthLabel(month)} title="By deal" /></div>
          {byDeal.length === 0 ? (
            <p className="border-t border-line px-6 py-5 text-[13px] text-muted">No deal analyses in this period.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {byDeal.map((d) => (
                <li key={d.id} className="flex items-center gap-4 px-6 py-3 text-[13.5px]">
                  <Link href={`/deals/${d.slug ?? d.id}`} className="w-48 shrink-0 truncate font-medium text-navy-900 hover:underline sm:w-64">{d.name}</Link>
                  <span className="hidden h-2 flex-1 overflow-hidden rounded-full bg-line sm:block"><span className="block h-full bg-brand-500" style={{ width: `${(d.usd / maxDeal) * 100}%` }} /></span>
                  <span className="w-24 shrink-0 text-right text-[12px] text-muted">{d.runs} run{d.runs === 1 ? "" : "s"}</span>
                  <span className="w-20 shrink-0 text-right tabular text-ink">{formatUsd(d.usd)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-8">
          <Card>
            <SectionTitle eyebrow="Breakdown" title="By purpose" />
            <ul className="space-y-1.5 text-[13px]">
              {byPurpose.map((p) => (
                <li key={p.purpose} className="flex justify-between gap-3"><span className="text-ink-soft first-letter:uppercase">{p.purpose}</span><span className="tabular text-ink">{formatUsd(p._sum.usd ?? 0)}</span></li>
              ))}
              {!byPurpose.length && <li className="text-muted">Nothing yet.</li>}
            </ul>
          </Card>
          <Card>
            <SectionTitle eyebrow="Breakdown" title="By model" />
            <ul className="space-y-1.5 text-[13px]">
              {byModel.map((m) => (
                <li key={m.model} className="flex justify-between gap-3"><span className="text-ink-soft">{m.model}</span><span className="tabular text-ink">{formatUsd(m._sum.usd ?? 0)}</span></li>
              ))}
              {!byModel.length && <li className="text-muted">Nothing yet.</li>}
            </ul>
          </Card>
          <Card>
            <SectionTitle eyebrow="Breakdown" title="By day" />
            <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1 text-[12.5px]">
              {byDay.map((d) => (
                <li key={d.day} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 tabular text-muted">{d.day}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full bg-brand-500" style={{ width: `${(d.usd / maxDay) * 100}%` }} /></span>
                  <span className="w-16 shrink-0 text-right tabular text-ink">{formatUsd(d.usd)}</span>
                </li>
              ))}
              {!byDay.length && <li className="text-muted">Nothing yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

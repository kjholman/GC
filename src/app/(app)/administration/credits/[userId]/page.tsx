import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { Card, PageHeader, SectionTitle, fmtDate } from "@/components/ui";
import { formatUsd } from "@/lib/ai/usage";
import { creditStatus } from "@/lib/credits/limits";
import { CreditBadge, UsageBar, usd } from "../parts";
import { CreditControls } from "./CreditControls";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const KIND_LABEL: Record<string, string> = {
  set_limit: "Allowance set", add: "Credit added", refill: "Refilled", cut_off: "AI switched off", restore: "AI switched back on", remove_limit: "Limit taken off",
};

/** One person's AI credit: allowance, controls, and how they have spent it. */
export default async function PersonCreditPage({ params }: PageProps<"/administration/credits/[userId]">) {
  await requireRole("ADMIN");
  const { userId } = await params;
  const [person, status] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, title: true, active: true } }),
    creditStatus(userId),
  ]);
  if (!person || !status) notFound();
  const name = person.name ?? person.email.split("@")[0];
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 11, 1));

  const [byMonth, byPurpose, work, history, people] = await Promise.all([
    db.$queryRaw<{ ym: string; usd: number; requests: number }[]>`
      SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS ym, SUM("usd")::float AS usd, COUNT(*)::int AS requests
      FROM "AiUsage" WHERE "userId" = ${userId} AND "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<{ purpose: string; usd: number; requests: number }[]>`
      SELECT "purpose", SUM("usd")::float AS usd, COUNT(*)::int AS requests
      FROM "AiUsage" WHERE "userId" = ${userId} GROUP BY 1 ORDER BY 2 DESC`,
    db.$queryRaw<{ key: string; at: Date; purpose: string; usd: number; slug: string | null; dealId: string | null; company: string | null; version: number | null; status: string | null }[]>`
      SELECT COALESCE(u."analysisId", u."purpose" || to_char(u."createdAt", 'YYYY-MM-DD')) AS key,
             MIN(u."createdAt") AS at, MIN(u."purpose") AS purpose, SUM(u."usd")::float AS usd,
             d."slug", d."id" AS "dealId", d."companyName" AS company, a."version", a."status"::text AS status
      FROM "AiUsage" u
      LEFT JOIN "Analysis" a ON a."id" = u."analysisId"
      LEFT JOIN "Deal" d ON d."id" = a."dealId"
      WHERE u."userId" = ${userId}
      GROUP BY 1, d."slug", d."id", d."companyName", a."version", a."status"
      ORDER BY MIN(u."createdAt") DESC LIMIT 25`,
    db.creditChange.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.user.findMany({ select: { id: true, name: true, email: true } }),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name ?? p.email.split("@")[0]]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + i, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = byMonth.find((m) => m.ym === ym);
    return { ym, label: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`, usd: row?.usd ?? 0, requests: row?.requests ?? 0 };
  });
  const peak = Math.max(...months.map((m) => m.usd), 0.01);
  const totalPurpose = byPurpose.reduce((s, p) => s + p.usd, 0);

  return (
    <>
      <PageHeader
        eyebrow="Administration · AI credit limits"
        title={name}
        actions={<Link href="/administration/credits" className="text-[13px] font-medium text-navy-700 hover:underline">All people</Link>}
        subtitle={<>{[person.title, person.email].filter(Boolean).join(" · ")}{!person.active && " · no access to GAIA"}</>}
      />
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Allowance</div>
                <div className="mt-1 font-display text-[30px] font-semibold text-navy-900">
                  {status.limitUsd != null ? usd(status.limitUsd) : status.isAdmin ? "Not limited" : "No limit"}
                </div>
                {status.limitUsd != null && status.since && <div className="text-[12.5px] text-muted">Counting since {fmtDate(status.since, true)}</div>}
              </div>
              <CreditBadge p={status} />
            </div>
            {status.limitUsd != null && (
              <div className="mt-5">
                <UsageBar used={status.usedUsd} limit={status.limitUsd} />
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-[13px]">
                  <span><span className="font-medium text-navy-900">{formatUsd(status.usedUsd)}</span> <span className="text-muted">used ({status.limitUsd > 0 ? ((status.usedUsd / status.limitUsd) * 100).toFixed(0) : 100}%)</span></span>
                  <span><span className="font-medium text-navy-900">{usd(status.remainingUsd ?? 0)}</span> <span className="text-muted">left</span></span>
                </div>
              </div>
            )}
            {status.cutOff && <p className="mt-4 text-[13px] text-neg">AI work is switched off for {name}: they can&apos;t start analyses or other AI tasks, and anything they started is paused.</p>}
          </Card>

          <Card>
            <SectionTitle eyebrow="Report" title="Spending by month (last 12 months)" />
            <div className="flex h-44 items-end gap-2">
              {months.map((m) => (
                <div key={m.ym} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${m.label}: ${formatUsd(m.usd)} over ${m.requests} AI requests`}>
                  <div className="text-[10.5px] tabular-nums text-muted">{m.usd > 0 ? `$${m.usd < 10 ? m.usd.toFixed(2) : m.usd.toFixed(0)}` : ""}</div>
                  <div className="w-full rounded-t bg-brand-600" style={{ height: `${Math.max(m.usd > 0 ? 2 : 0, (m.usd / peak) * 100)}%` }} />
                  <div className="text-[10.5px] text-muted">{m.label}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card pad={false}>
            <div className="px-6 pt-6"><SectionTitle eyebrow="Report" title="What the credit went on" /></div>
            {byPurpose.length ? (
              <table className="w-full text-left text-[13.5px]">
                <thead>
                  <tr className="border-y border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                    <th className="py-3 pr-4 pl-6 font-semibold">Purpose</th>
                    <th className="px-4 py-3 text-right font-semibold">AI requests</th>
                    <th className="px-4 py-3 text-right font-semibold">Spent</th>
                    <th className="py-3 pr-6 pl-4 text-right font-semibold">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {byPurpose.map((p) => (
                    <tr key={p.purpose}>
                      <td className="py-3 pr-4 pl-6 capitalize">{p.purpose}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{p.requests}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatUsd(p.usd)}</td>
                      <td className="py-3 pr-6 pl-4 text-right tabular-nums">{totalPurpose ? ((p.usd / totalPurpose) * 100).toFixed(0) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="px-6 pb-6 text-[13px] text-muted">No AI spending yet.</p>}
          </Card>

          <Card pad={false}>
            <div className="px-6 pt-6"><SectionTitle eyebrow="Report" title="Recent work" /></div>
            {work.length ? (
              <table className="w-full text-left text-[13.5px]">
                <thead>
                  <tr className="border-y border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                    <th className="py-3 pr-4 pl-6 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">What</th>
                    <th className="py-3 pr-6 pl-4 text-right font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {work.map((w) => (
                    <tr key={w.key}>
                      <td className="whitespace-nowrap py-3 pr-4 pl-6 text-muted">{fmtDate(w.at)}</td>
                      <td className="px-4 py-3">
                        {w.company ? (
                          <Link href={`/deals/${w.slug ?? w.dealId}`} className="font-medium text-navy-900 hover:underline">{w.company}{w.version ? `, version ${w.version}` : ""}</Link>
                        ) : <span className="capitalize">{w.purpose}</span>}
                        {w.status === "PAUSED" && <span className="ml-2 text-[12px] text-amber-700">paused</span>}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-6 pl-4 text-right tabular-nums">{formatUsd(w.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="px-6 pb-6 text-[13px] text-muted">Nothing yet.</p>}
          </Card>

          <Card pad={false}>
            <div className="px-6 pt-6"><SectionTitle eyebrow="History" title="Changes to this allowance" /></div>
            {history.length ? (
              <ul className="divide-y divide-line border-t border-line text-[13.5px]">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 px-6 py-3">
                    <span>
                      <span className="font-medium text-navy-900">{KIND_LABEL[h.kind] ?? h.kind}</span>
                      {h.amountUsd != null && <span> · {usd(h.amountUsd)}</span>}
                      {h.limitAfter != null && h.kind !== "set_limit" && h.kind !== "add" ? null : h.limitAfter != null && <span className="text-muted"> (allowance now {usd(h.limitAfter)})</span>}
                      {h.usedBefore != null && <span className="text-muted"> · {formatUsd(h.usedBefore)} used at the time</span>}
                      {h.note && <span className="block text-[12.5px] text-ink-soft">{h.note}</span>}
                    </span>
                    <span className="text-[12px] text-muted">{fmtDate(h.createdAt, true)}{h.byId ? ` · ${nameOf.get(h.byId) ?? ""}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="px-6 pb-6 text-[13px] text-muted">No changes yet.</p>}
          </Card>
        </div>
        <div>
          {status.isAdmin ? (
            <Card><p className="text-[13.5px] text-ink-soft">This is the administrator account (ADMIN_EMAIL). Its AI use is never limited.</p></Card>
          ) : (
            <CreditControls userId={person.id} name={name} hasLimit={status.limitUsd != null} cutOff={status.cutOff} limitUsd={status.limitUsd} />
          )}
        </div>
      </div>
    </>
  );
}

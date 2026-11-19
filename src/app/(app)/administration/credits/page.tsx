import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { Card, PageHeader, cx } from "@/components/ui";
import { CreditBadge, UsageBar, usd } from "./parts";
import { formatUsd } from "@/lib/ai/usage";
import { creditOverview } from "@/lib/credits/limits";

/** The administrator's view of everyone's AI credit allowance and spending. */
export default async function CreditsPage() {
  await requireRole("ADMIN");
  const people = await creditOverview();
  const limited = people.filter((p) => p.limitUsd != null);
  const totals = {
    allowances: limited.reduce((s, p) => s + (p.limitUsd ?? 0), 0),
    usedAgainst: limited.reduce((s, p) => s + p.usedUsd, 0),
    month: people.reduce((s, p) => s + p.spentThisMonthUsd, 0),
    blocked: people.filter((p) => p.blocked).length,
  };
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="AI credit limits"
        actions={<Link href="/administration" className="text-[13px] font-medium text-navy-700 hover:underline">Back to Administration</Link>}
        subtitle="Give each person an allowance of AI credit in US dollars, add to it, refill it, or switch their AI work off. Someone with an allowance can't spend past it: GAIA checks before every AI request, and pauses their analyses, with nothing lost, until you add credit. People with no limit are not restricted."
      />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Allowances given", usd(totals.allowances), `${limited.length} ${limited.length === 1 ? "person" : "people"} with a limit`],
          ["Used against them", usd(totals.usedAgainst), totals.allowances ? `${((totals.usedAgainst / totals.allowances) * 100).toFixed(0)}% of all allowances` : "No allowances yet"],
          ["Spent this month", usd(totals.month), "Everyone, limited or not"],
          ["Stopped", String(totals.blocked), "Used up or switched off"],
        ].map(([k, v, h]) => (
          <Card key={k}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{k}</div>
            <div className="mt-1 font-display text-[26px] font-semibold text-navy-900">{v}</div>
            <div className="text-[12px] text-muted">{h}</div>
          </Card>
        ))}
      </div>
      <Card pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="py-3 pr-4 pl-6 font-semibold">Person</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Allowance</th>
                <th className="min-w-[180px] px-4 py-3 font-semibold">Used / left</th>
                <th className="px-4 py-3 text-right font-semibold">This month</th>
                <th className="px-4 py-3 text-right font-semibold">All time</th>
                <th className="py-3 pr-6 pl-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {people.map((p) => (
                <tr key={p.userId} className={cx(!p.active && "opacity-50")}>
                  <td className="py-3 pr-4 pl-6">
                    <div className="font-medium text-navy-900">{p.name ?? p.email.split("@")[0]}</div>
                    <div className="text-[12.5px] text-muted">{p.email}{!p.active && " · no access"}</div>
                  </td>
                  <td className="px-4 py-3"><CreditBadge p={p} /></td>
                  <td className="whitespace-nowrap px-4 py-3">{p.limitUsd != null ? usd(p.limitUsd) : <span className="text-muted">None</span>}</td>
                  <td className="px-4 py-3">
                    {p.limitUsd != null ? (
                      <>
                        <UsageBar used={p.usedUsd} limit={p.limitUsd} />
                        <div className="mt-1 text-[12px] text-muted">{formatUsd(p.usedUsd)} used · {usd(p.remainingUsd ?? 0)} left</div>
                      </>
                    ) : <span className="text-[12.5px] text-muted">Not limited</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatUsd(p.spentThisMonthUsd)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatUsd(p.spentAllTimeUsd)}</td>
                  <td className="whitespace-nowrap py-3 pr-6 pl-4 text-right">
                    <Link href={`/administration/credits/${p.userId}`} className="font-medium text-navy-700 hover:underline">{p.isAdmin ? "Report" : "Manage"} →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-4 text-[12.5px] text-muted">
        Spend counts against the person who started the work: the person who started an analysis version (even when it resumes later), or who ran a knowledge base or Training Studio task. A request already under way when the allowance runs out is allowed to finish, so the last one can take spending slightly past the allowance.
      </p>
    </>
  );
}

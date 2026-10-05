import Link from "next/link";
import type { DealStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { Button, Card, Empty, PageHeader, SectionTitle, STATUS_META, ScoreRing, StatusBadge, cx, relTime } from "@/components/ui";

export const metadata = { title: "Overview" };

const FUNNEL: DealStatus[] = ["SCREENING", "PENDING_INFO", "DILIGENCE", "IC_REVIEW", "INVESTED", "REJECTED"];

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

export default async function Overview() {
  const user = await requireUser();
  const since = daysAgo(90);
  const [counts, recent, running, activity, screened90, advanced90] = await Promise.all([
    db.deal.groupBy({ by: ["status"], _count: true }),
    db.deal.findMany({ orderBy: { updatedAt: "desc" }, take: 8 }),
    db.analysis.findMany({
      where: { status: { in: ["QUEUED", "RUNNING"] } },
      include: { deal: { select: { id: true, companyName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.activity.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { deal: { select: { id: true, companyName: true } }, user: { select: { name: true, email: true } } },
    }),
    db.deal.count({ where: { createdAt: { gte: since } } }),
    db.deal.count({ where: { createdAt: { gte: since }, status: { in: ["DILIGENCE", "IC_REVIEW", "INVESTED"] } } }),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<DealStatus, number>>;
  const total = FUNNEL.reduce((s, k) => s + (byStatus[k] ?? 0), 0);
  const firstName = user.name?.split(" ")[0];
  const hour = Number(new Date().toLocaleString("en-CA", { hour: "numeric", hour12: false, timeZone: "America/Toronto" }));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Toronto" })}
        title={`${greeting}${firstName ? `, ${firstName}` : ""}.`}
        subtitle="Your deal flow at a glance — what needs a decision, what is awaiting founders, and what the analyst is working on."
        actions={
          <Link href="/deals/new">
            <Button>Screen a new deck</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[3px] border border-line bg-line md:grid-cols-4">
        {[
          { label: "Active pipeline", value: (byStatus.SCREENING ?? 0) + (byStatus.PENDING_INFO ?? 0) + (byStatus.DILIGENCE ?? 0) + (byStatus.IC_REVIEW ?? 0), note: "Screening through IC" },
          { label: "Awaiting founders", value: byStatus.PENDING_INFO ?? 0, note: "Information requested" },
          { label: "In diligence", value: (byStatus.DILIGENCE ?? 0) + (byStatus.IC_REVIEW ?? 0), note: "Including IC review" },
          { label: "Advance rate · 90d", value: screened90 ? `${Math.round((advanced90 / screened90) * 100)}%` : "—", note: `${screened90} screened` },
        ].map((k) => (
          <div key={k.label} className="bg-paper px-6 py-5">
            <div className="eyebrow">{k.label}</div>
            <div className="mt-2 font-serif text-[38px] leading-none tabular text-navy-900">{k.value}</div>
            <div className="mt-2 text-[12px] text-muted">{k.note}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <Card>
            <SectionTitle eyebrow="Pipeline" title="Stage distribution" />
            {total === 0 ? (
              <p className="text-sm text-muted">No deals yet.</p>
            ) : (
              <>
                <div className="flex h-3 overflow-hidden rounded-full bg-line">
                  {FUNNEL.map((s) =>
                    byStatus[s] ? (
                      <div key={s} className={STATUS_META[s].dot} style={{ width: `${((byStatus[s] ?? 0) / total) * 100}%` }} title={STATUS_META[s].label} />
                    ) : null,
                  )}
                </div>
                <div className="mt-5 grid grid-cols-3 gap-y-4 md:grid-cols-6">
                  {FUNNEL.map((s) => (
                    <Link key={s} href={`/deals?status=${s}`} className="group">
                      <div className="flex items-center gap-2 text-[12px] text-muted group-hover:text-navy-800">
                        <span className={cx("h-2 w-2 rounded-full", STATUS_META[s].dot)} />
                        {STATUS_META[s].label}
                      </div>
                      <div className="mt-1 pl-4 font-serif text-2xl tabular text-navy-900">{byStatus[s] ?? 0}</div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card pad={false}>
            <div className="px-6 pt-6">
              <SectionTitle
                eyebrow="Recently updated"
                title="Deals"
                action={<Link href="/deals" className="text-[13px] text-navy-700 hover:underline">View pipeline →</Link>}
              />
            </div>
            {recent.length === 0 ? (
              <div className="px-6 pb-6">
                <Empty title="No deals screened yet">Upload a pitch deck to produce your first AI investment memo.</Empty>
              </div>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {recent.map((d) => (
                  <li key={d.id}>
                    <Link href={`/deals/${d.id}`} className="flex items-center gap-5 px-6 py-4 transition-colors hover:bg-ivory/70">
                      <ScoreRing score={d.latestScore} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-navy-900">{d.companyName}</div>
                        <div className="truncate text-[12.5px] text-muted">
                          {[d.sector, d.modality, d.stage].filter(Boolean).join(" · ") || "Awaiting analysis"}
                        </div>
                      </div>
                      <StatusBadge status={d.status} />
                      <div className="hidden w-20 text-right text-[12px] text-muted md:block">{relTime(d.updatedAt)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-8">
          <Card>
            <SectionTitle eyebrow="AI analyst" title="In progress" />
            {running.length === 0 ? (
              <p className="text-[13px] text-muted">No analyses running.</p>
            ) : (
              <ul className="space-y-4">
                {running.map((a) => (
                  <li key={a.id}>
                    <Link href={`/deals/${a.deal.id}`} className="block">
                      <div className="flex items-center gap-2 text-[13.5px] font-medium text-navy-900">
                        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-gold-500" />
                        {a.deal.companyName}
                        <span className="text-[11px] font-normal text-muted">v{a.version}</span>
                      </div>
                      <div className="mt-1 pl-3.5 text-[12px] text-muted">{a.progress ?? "Queued"}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionTitle eyebrow="Firm-wide" title="Activity" />
            <ol className="relative space-y-5 border-l border-line pl-5">
              {activity.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute top-1.5 -left-[23.5px] h-2 w-2 rounded-full border border-gold-500 bg-paper" />
                  <Link href={`/deals/${a.deal.id}`} className="text-[13px] font-medium text-navy-900 hover:underline">
                    {a.deal.companyName}
                  </Link>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-soft">{a.message}</p>
                  <div className="mt-1 text-[11px] text-muted">
                    {a.user ? (a.user.name ?? a.user.email.split("@")[0]) : "AI analyst"} · {relTime(a.createdAt)}
                  </div>
                </li>
              ))}
              {activity.length === 0 && <li className="text-[13px] text-muted">Nothing yet.</li>}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

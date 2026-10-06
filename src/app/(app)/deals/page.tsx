import Link from "next/link";
import type { DealStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatUsd, spendByDeal } from "@/lib/ai/usage";
import { Pagination, pageParam } from "@/components/Pagination";
import { PipelineFilters } from "./PipelineFilters";
import { DealLogo } from "@/components/DealLogo";
import { MemeScene } from "@/components/MemeScene";
import { Button, Card, Empty, PageHeader, REC_META, STATUS_META, ScoreRing, StatusBadge, cx, fmtDate } from "@/components/ui";


const TABS: (DealStatus | "ALL" | "OPEN" | "PAUSED")[] = ["OPEN", "SCREENING", "PAUSED", "PENDING_INFO", "DILIGENCE", "IC_REVIEW", "INVESTED", "REJECTED", "ARCHIVED", "ALL"];

/** A deal whose first analysis was stopped or paused before any memo existed. */
const PAUSED_WHERE: Prisma.DealWhereInput = {
  analyses: { none: { status: { in: ["COMPLETE", "QUEUED", "RUNNING"] } }, some: { status: { in: ["STOPPED", "PAUSED"] } } },
};

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const sp = await searchParams;
  const status = (typeof sp.status === "string" ? sp.status : "OPEN") as (typeof TABS)[number];
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const rec = str("rec"), sector = str("sector"), stage = str("stage"), from = str("from"), to = str("to"), sort = str("sort");
  const minScore = Number(str("minScore")) || 0;
  const runs = str("runs");
  const page = pageParam(sp.page);
  const PAGE_SIZE = 25;

  const statusWhere: Prisma.DealWhereInput =
    status === "ALL" ? {}
    : status === "OPEN" ? { status: { in: ["SCREENING", "PENDING_INFO", "DILIGENCE", "IC_REVIEW"] } }
    : status === "PAUSED" ? PAUSED_WHERE
    : status === "SCREENING" ? { status, NOT: PAUSED_WHERE }
    : { status };
  const where: Prisma.DealWhereInput = {
    ...statusWhere,
    ...(q
      ? {
          OR: [
            { companyName: { contains: q, mode: "insensitive" } },
            { sector: { contains: q, mode: "insensitive" } },
            { modality: { contains: q, mode: "insensitive" } },
            { oneLiner: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(rec === "NONE" ? { recommendation: null } : rec ? { recommendation: rec } : {}),
    ...(sector ? { sector } : {}),
    ...(stage ? { stage } : {}),
    ...(minScore ? { latestScore: { gte: minScore } } : {}),
    ...(runs === "0" ? { analysisCount: 0 } : runs === "1" ? { analysisCount: 1 } : runs === "2" ? { analysisCount: 2 } : runs === "3" ? { analysisCount: { gte: 3 } } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}) } }
      : {}),
  };
  const orderBy: Prisma.DealOrderByWithRelationInput[] =
    sort === "newest" ? [{ createdAt: "desc" }]
    : sort === "oldest" ? [{ createdAt: "asc" }]
    : sort === "score" ? [{ latestScore: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }]
    : sort === "name" ? [{ companyName: "asc" }]
    : [{ updatedAt: "desc" }];
  const [deals, counts, total, pausedCount, sectorRows, stageRows] = await Promise.all([
    db.deal.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      omit: { logo: true, researchDossier: true },
      include: {
        owner: { select: { name: true, email: true } },
        _count: { select: { documents: true, analyses: { where: { status: "COMPLETE" } } } },
        analyses: { orderBy: { version: "desc" }, take: 1, select: { status: true } },
      },
    }),
    db.deal.groupBy({ by: ["status"], _count: true }),
    db.deal.count({ where }),
    db.deal.count({ where: PAUSED_WHERE }),
    db.deal.findMany({ where: { sector: { not: null } }, distinct: ["sector"], select: { sector: true }, orderBy: { sector: "asc" } }),
    db.deal.findMany({ where: { stage: { not: null } }, distinct: ["stage"], select: { stage: true }, orderBy: { stage: "asc" } }),
  ]);
  const spend = await spendByDeal(deals.map((d) => d.id));
  // Keep every filter when switching status tab or page.
  const qs = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, q, rec, sector, stage, from, to, sort, minScore: minScore || "", runs, page: "", ...over })) if (v) p.set(k, String(v));
    return `/deals?${p.toString()}`;
  };
  const c = Object.fromEntries(counts.map((x) => [x.status, x._count])) as Record<string, number>;
  const countFor = (t: string) =>
    t === "ALL"
      ? Object.values(c).reduce((a, b) => a + b, 0)
      : t === "OPEN"
        ? (c.SCREENING ?? 0) + (c.PENDING_INFO ?? 0) + (c.DILIGENCE ?? 0) + (c.IC_REVIEW ?? 0)
        : t === "PAUSED"
          ? pausedCount
          : t === "SCREENING"
            ? (c.SCREENING ?? 0) - pausedCount
            : (c[t] ?? 0);
  const label = (t: string) => (t === "ALL" ? "All" : t === "OPEN" ? "Open" : t === "PAUSED" ? "Paused" : STATUS_META[t as DealStatus].label);
  // Stopped or paused before any memo existed: shown as Paused rather than Screening.
  // Stopped on a later version: the deal keeps the stage from its last finished analysis.
  const badgeFor = (d: (typeof deals)[number]) => {
    const latest = d.analyses[0]?.status;
    if (latest === "PAUSED") return <PausedBadge label="Paused: out of credit" />;
    if (latest === "STOPPED" && d._count.analyses === 0) return <PausedBadge label="Paused" />;
    return <StatusBadge status={d.status} />;
  };

  return (
    <>
      <PageHeader
        eyebrow="Deal flow"
        title="Pipeline"
        subtitle="Every opportunity the team has screened, with the Sharminator's latest recommendation."
        actions={
          <Link href="/deals/new">
            <Button>Screen a new deck</Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <Link
              key={t}
              href={qs({ status: t, page: null })}
              className={cx(
                "rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                status === t ? "bg-navy-900 text-white" : "text-ink-soft hover:bg-paper",
              )}
            >
              {label(t)} <span className={cx("ml-1 tabular", status === t ? "text-brand-300" : "text-muted")}>{countFor(t)}</span>
            </Link>
          ))}
        </div>
      </div>
      <PipelineFilters sectors={sectorRows.map((r) => r.sector!).filter(Boolean)} stages={stageRows.map((r) => r.stage!).filter(Boolean)} />

      {deals.length === 0 ? (
        <div className="flex flex-col items-center gap-5 py-6">
          <MemeScene scene="petri" size={240} />
          <Empty title="No deals match">Try another status or clear some filters.</Empty>
        </div>
      ) : (
        <>
        {/* Phones: one card per deal. */}
        <Card pad={false} className="md:hidden">
          <ul className="divide-y divide-line">
            {deals.map((d) => (
              <li key={d.id}>
                <Link href={`/deals/${d.slug ?? d.id}`} className="flex items-start gap-4 px-4 py-4 hover:bg-mist/70">
                  <DealLogo dealId={d.id} name={d.companyName} hasLogo={!!d.logoMime} version={d.logoCheckedAt?.getTime()} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-navy-900">{d.companyName}</div>
                    <div className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">{d.oneLiner ?? ([d.sector, d.modality].filter(Boolean).join(" · ") || "Awaiting analysis")}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {badgeFor(d)}
                      {d.latestScore != null && <span className="text-[12px] tabular text-ink">Score {d.latestScore}</span>}
                      <span className="text-[12px] text-muted">{d.analysisCount} analys{d.analysisCount === 1 ? "is" : "es"}</span>
                      {spend.has(d.id) && <span className="text-[12px] tabular text-muted">{formatUsd(spend.get(d.id)!)}</span>}
                      <span className="text-[12px] text-muted">{fmtDate(d.updatedAt)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card pad={false} className="hidden overflow-x-auto md:block">
          <div>
          <table className="w-full min-w-[900px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="py-3 pr-4 pl-6 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Sector · Modality</th>
                <th className="px-4 py-3 font-semibold">Stage</th>
                <th className="px-4 py-3 font-semibold">Sharminator call</th>
                <th className="px-4 py-3 text-center font-semibold">Score</th>
                <th className="px-4 py-3 text-center font-semibold">Analyses</th>
                <th className="px-4 py-3 text-right font-semibold">AI cost</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="py-3 pr-6 pl-4 text-right font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {deals.map((d) => (
                <tr key={d.id} className="group transition-colors hover:bg-mist/70">
                  <td className="py-4 pr-4 pl-6">
                    <div className="flex items-center gap-3">
                      <DealLogo dealId={d.id} name={d.companyName} hasLogo={!!d.logoMime} version={d.logoCheckedAt?.getTime()} size={36} className="!rounded-lg" />
                      <div className="min-w-0">
                        <Link href={`/deals/${d.slug ?? d.id}`} className="font-medium text-navy-900 group-hover:underline">
                          {d.companyName}
                        </Link>
                        <div className="mt-0.5 max-w-[320px] truncate text-[12px] text-muted">{d.oneLiner ?? "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-ink-soft">
                    <div>{d.sector ?? "—"}</div>
                    <div className="max-w-[220px] truncate text-[12px] text-muted">{d.modality}</div>
                  </td>
                  <td className="max-w-[160px] px-4 py-4 text-ink-soft">{d.stage ?? "—"}</td>
                  <td className={cx("px-4 py-4 font-medium", d.recommendation && REC_META[d.recommendation]?.cls)}>
                    {d.recommendation ? REC_META[d.recommendation]?.label : <span className="text-muted">Pending</span>}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <ScoreRing score={d.latestScore} size={40} />
                  </td>
                  <td className="px-4 py-4 text-center tabular text-ink">{d.analysisCount}</td>
                  <td className="px-4 py-4 text-right text-[12.5px] tabular text-muted">{spend.has(d.id) ? formatUsd(spend.get(d.id)!) : "—"}</td>
                  <td className="px-4 py-4">
                    {badgeFor(d)}
                  </td>
                  <td className="py-4 pr-6 pl-4 text-right text-[12.5px] text-muted">{fmtDate(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={(p) => qs({ page: p > 1 ? p : null })} />
        </>
      )}
    </>
  );
}

function PausedBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#efdcb4] bg-warn-bg px-2.5 py-0.5 text-[11.5px] font-medium text-warn">
      <span className="h-1.5 w-1.5 rounded-full bg-warn" />
      {label}
    </span>
  );
}

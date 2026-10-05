import Link from "next/link";
import type { DealStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Button, Card, Empty, PageHeader, REC_META, STATUS_META, ScoreRing, StatusBadge, cx, fmtDate, inputCls } from "@/components/ui";

export const metadata = { title: "Deal pipeline" };

const TABS: (DealStatus | "ALL" | "OPEN")[] = ["OPEN", "SCREENING", "PENDING_INFO", "DILIGENCE", "IC_REVIEW", "INVESTED", "REJECTED", "ARCHIVED", "ALL"];

export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const sp = await searchParams;
  const status = (typeof sp.status === "string" ? sp.status : "OPEN") as (typeof TABS)[number];
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const statusWhere: Prisma.DealWhereInput =
    status === "ALL" ? {} : status === "OPEN" ? { status: { in: ["SCREENING", "PENDING_INFO", "DILIGENCE", "IC_REVIEW"] } } : { status };
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
  };
  const [deals, counts] = await Promise.all([
    db.deal.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { owner: { select: { name: true, email: true } }, _count: { select: { documents: true, analyses: true } } },
    }),
    db.deal.groupBy({ by: ["status"], _count: true }),
  ]);
  const c = Object.fromEntries(counts.map((x) => [x.status, x._count])) as Record<string, number>;
  const countFor = (t: string) =>
    t === "ALL"
      ? Object.values(c).reduce((a, b) => a + b, 0)
      : t === "OPEN"
        ? (c.SCREENING ?? 0) + (c.PENDING_INFO ?? 0) + (c.DILIGENCE ?? 0) + (c.IC_REVIEW ?? 0)
        : (c[t] ?? 0);
  const label = (t: string) => (t === "ALL" ? "All" : t === "OPEN" ? "Open" : STATUS_META[t as DealStatus].label);

  return (
    <>
      <PageHeader
        eyebrow="Deal flow"
        title="Pipeline"
        subtitle="Every opportunity the team has screened, with the AI analyst's latest recommendation."
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
              href={`/deals?status=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cx(
                "rounded-[3px] px-3 py-1.5 text-[13px] transition-colors",
                status === t ? "bg-navy-900 text-white" : "text-ink-soft hover:bg-paper",
              )}
            >
              {label(t)} <span className={cx("ml-1 tabular", status === t ? "text-gold-300" : "text-muted")}>{countFor(t)}</span>
            </Link>
          ))}
        </div>
        <form className="w-72">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Search company, sector, modality…" className={inputCls} />
        </form>
      </div>

      {deals.length === 0 ? (
        <Empty title="No deals match">Try another stage or search term.</Empty>
      ) : (
        <Card pad={false} className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="py-3 pr-4 pl-6 font-semibold">Company</th>
                <th className="px-4 py-3 font-semibold">Sector · Modality</th>
                <th className="px-4 py-3 font-semibold">Stage</th>
                <th className="px-4 py-3 font-semibold">AI recommendation</th>
                <th className="px-4 py-3 text-center font-semibold">Score</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="py-3 pr-6 pl-4 text-right font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {deals.map((d) => (
                <tr key={d.id} className="group transition-colors hover:bg-ivory/70">
                  <td className="py-4 pr-4 pl-6">
                    <Link href={`/deals/${d.id}`} className="font-medium text-navy-900 group-hover:underline">
                      {d.companyName}
                    </Link>
                    <div className="mt-0.5 max-w-[320px] truncate text-[12px] text-muted">{d.oneLiner ?? "—"}</div>
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
                  <td className="px-4 py-4">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="py-4 pr-6 pl-4 text-right text-[12.5px] text-muted">{fmtDate(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

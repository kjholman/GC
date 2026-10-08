import { Paged } from "@/components/Pager";
import Link from "next/link";
import { db } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth/session";
import { Card, Empty, REC_META, cx, fmtDate } from "@/components/ui";
import { ExemplarToggle } from "./ExemplarToggle";
import { Pagination, pageParam } from "@/components/Pagination";


export default async function ExemplarsPage({ searchParams }: PageProps<"/training/exemplars">) {
  const page = pageParam((await searchParams).page);
  const PAGE = 20;
  const user = await requireUser();
  const canEdit = hasRole(user.role, "PARTNER");
  const exemplars = await db.exemplar.findMany({ orderBy: { createdAt: "desc" } });
  // Finished memos not yet turned into examples, latest version per deal, for one-click correcting.
  const used = new Set(exemplars.map((e) => e.sourceAnalysisId).filter(Boolean));
  const candidates = canEdit
    ? (
        await db.analysis.findMany({
          where: { status: "COMPLETE" },
          orderBy: { completedAt: "desc" },
          take: 500,
          select: { id: true, version: true, recommendation: true, overallScore: true, completedAt: true, dealId: true, deal: { select: { companyName: true, sector: true } }, feedback: { select: { verdict: true } } },
        })
      )
        .filter((a, i, all) => !used.has(a.id) && all.findIndex((b) => b.dealId === a.dealId) === i)
    : [];
  return (
    <div>
      <p className="mb-6 max-w-3xl text-[14px] leading-relaxed text-ink-soft">
        Example memos are memos the partners have corrected and approved as the standard to follow. When a new deal resembles one, GAIA studies it before writing. The best ones to pick are memos where GAIA was wrong or only partly right: correcting those teaches it the most.
      </p>
      {candidates.length > 0 && (
        <Card className="mb-8">
          <div className="eyebrow mb-1 text-brand-600">Create an example memo</div>
          <h3 className="font-display text-[20px] font-semibold text-navy-900">Pick a finished memo to correct</h3>
          <p className="mt-1 mb-4 text-[13px] text-ink-soft">You fix the verdict, score and the parts GAIA got wrong, then add a note on why. It takes about five minutes.</p>
          <Paged as="ul" pageSize={8} className="divide-y divide-line" pagerClassName="border-t border-line">
            {candidates.map((a) => {
              const disagreed = a.feedback.some((f) => f.verdict !== "AGREE");
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium text-navy-900">{a.deal.companyName} <span className="text-[12px] font-normal text-muted">v{a.version}</span></span>
                    <span className="block text-[12.5px] text-muted">
                      {[a.deal.sector, a.recommendation ? REC_META[a.recommendation]?.label : null, a.overallScore != null ? `score ${a.overallScore}` : null, fmtDate(a.completedAt)].filter(Boolean).join(" · ")}
                      {disagreed && <span className="ml-2 text-warn">● A partner disagreed: a good one to correct</span>}
                    </span>
                  </span>
                  <Link href={`/training/exemplars/new?analysis=${a.id}`} className="shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-navy-800 hover:border-navy-700">
                    Correct this memo →
                  </Link>
                </li>
              );
            })}
          </Paged>
        </Card>
      )}
      {exemplars.length === 0 ? (
        <Empty title="No example memos yet">{candidates.length ? "Pick a finished memo above to create the first one." : "Once GAIA has finished a memo, it will appear here to correct."}</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {exemplars.slice((page - 1) * PAGE, page * PAGE).map((e) => (
            <Card key={e.id} className={cx(!e.active && "opacity-50")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-semibold text-[20px] text-navy-900">{e.title}</h3>
                  <div className="mt-1 text-[12.5px] text-muted">{[e.sector, e.modality].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="text-right">
                  <div className={cx("text-[13px] font-medium", REC_META[e.recommendation]?.cls)}>{REC_META[e.recommendation]?.label}</div>
                  <div className="text-[12px] tabular text-muted">score {e.overallScore}</div>
                </div>
              </div>
              <p className="mt-4 border-l-2 border-brand-500 pl-3 text-[13.5px] italic leading-relaxed text-ink">{e.partnerCommentary}</p>
              <div className="mt-4 flex items-center justify-between text-[12px] text-muted">
                <span>Saved {fmtDate(e.createdAt)}</span>
                <span className="flex gap-4">
                  {e.sourceAnalysisId && <Link href={`/training/exemplars/new?analysis=${e.sourceAnalysisId}`} className="text-navy-700 hover:underline">Original memo</Link>}
                  {canEdit && <ExemplarToggle id={e.id} active={e.active} />}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={PAGE} total={exemplars.length} href={(p) => `/training/exemplars?page=${p}`} />
    </div>
  );
}

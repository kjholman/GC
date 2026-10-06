import Link from "next/link";
import { db } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth/session";
import { Card, Empty, REC_META, cx, fmtDate } from "@/components/ui";
import { ExemplarToggle } from "./ExemplarToggle";

export const metadata = { title: "Exemplar memos" };

export default async function ExemplarsPage() {
  const user = await requireUser();
  const canEdit = hasRole(user.role, "PARTNER");
  const exemplars = await db.exemplar.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <div>
      <p className="mb-6 max-w-3xl text-[14px] leading-relaxed text-ink-soft">
        Exemplars are memos the partners have corrected and endorsed as the standard. When a new deal resembles one, the analyst studies the endorsed verdict and reasoning before writing. To create one, open any deal and choose <span className="font-medium text-ink">Correct &amp; endorse as exemplar</span>.
      </p>
      {exemplars.length === 0 ? (
        <Empty title="No exemplars yet">Open a deal with a completed memo and choose “Correct &amp; endorse as exemplar”.</Empty>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {exemplars.map((e) => (
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
                <span>Endorsed {fmtDate(e.createdAt)}</span>
                <span className="flex gap-4">
                  {e.sourceAnalysisId && <Link href={`/training/exemplars/new?analysis=${e.sourceAnalysisId}`} className="text-navy-700 hover:underline">Source memo</Link>}
                  {canEdit && <ExemplarToggle id={e.id} active={e.active} />}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

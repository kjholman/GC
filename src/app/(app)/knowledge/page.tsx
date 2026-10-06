import { db } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth/session";
import { Card, PageHeader, cx } from "@/components/ui";
import { Principles } from "./Principles";
import { DeleteCompanyButton, EditCompanyDialog, PortfolioForm } from "./PortfolioForm";

export const metadata = { title: "Knowledge base" };

const OUTCOME: Record<string, { label: string; cls: string }> = {
  ACQUIRED: { label: "Acquired", cls: "bg-pos-bg text-pos" },
  IPO: { label: "IPO", cls: "bg-info-bg text-info" },
  MERGED: { label: "Merged", cls: "bg-info-bg text-info" },
  ACTIVE: { label: "Active", cls: "bg-brand-100 text-brand-600" },
  WOUND_DOWN: { label: "Wound down", cls: "bg-neg-bg text-neg" },
  UNKNOWN: { label: "Outcome n/a", cls: "bg-[#f1efea] text-muted" },
};

export default async function KnowledgePage() {
  const user = await requireUser();
  const canEdit = hasRole(user.role, "PARTNER");
  const [companies, principles, feedbackCount] = await Promise.all([
    db.portfolioCompany.findMany({ orderBy: [{ outcome: "asc" }, { name: "asc" }] }),
    db.investmentPrinciple.findMany({ orderBy: { createdAt: "asc" } }),
    db.analysisFeedback.count(),
  ]);
  const exits = companies.filter((c) => c.outcome === "ACQUIRED" || c.outcome === "IPO" || c.outcome === "MERGED").length;

  return (
    <>
      <PageHeader
        eyebrow="Institutional memory"
        title="Knowledge base"
        subtitle="Genesys Capital's investment history. Every analysis benchmarks new opportunities against these companies and their outcomes. The more complete and candid this record, the sharper the analyst's judgement."
      />
      <div className="mb-8 grid grid-cols-2 gap-px md:grid-cols-4 overflow-hidden rounded-lg border border-line bg-line">
        {[
          ["Companies on record", companies.length],
          ["Realised exits", exits],
          ["Awaiting verification", companies.filter((c) => !c.verified).length],
          ["Partner calibrations", feedbackCount],
        ].map(([k, v]) => (
          <div key={k} className="bg-paper px-6 py-5">
            <div className="eyebrow">{k}</div>
            <div className="mt-2 font-display font-semibold text-[34px] leading-none tabular text-navy-900">{v}</div>
          </div>
        ))}
      </div>

      <div className="mb-8">
        <Principles principles={principles} canEdit={canEdit} />
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-5 md:grid-cols-2">
          {companies.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display font-semibold text-[20px] leading-tight text-navy-900">{c.name}</h3>
                  <div className="mt-1 text-[12.5px] text-muted">
                    {[c.sector, c.modality].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className={cx("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", OUTCOME[c.outcome].cls)}>
                  {OUTCOME[c.outcome].label}
                </span>
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">{c.description}</p>
              {c.outcomeNotes && <p className="mt-2 text-[13px] leading-relaxed text-ink"><span className="text-muted">Outcome: </span>{c.outcomeNotes}</p>}
              {c.lessons && <p className="mt-2 border-l-2 border-brand-500 pl-3 text-[13px] italic leading-relaxed text-ink">{c.lessons}</p>}
              <div className="mt-auto flex items-center justify-between pt-4 text-[11.5px] text-muted">
                <span>
                  {[c.stageAtEntry, c.yearInvested].filter(Boolean).join(" · ")}
                  {!c.verified && <span className="ml-2 text-warn">● Unverified</span>}
                </span>
                {canEdit && (
                  <span className="flex gap-3">
                    <EditCompanyDialog company={c} />
                    <DeleteCompanyButton id={c.id} name={c.name} />
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
        {canEdit && (
          <div>
            <div className="sticky top-10">
              <PortfolioForm company={null} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

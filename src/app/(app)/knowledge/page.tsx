import { ChangeLog } from "@/components/ChangeLog";
import { pageParam } from "@/components/Pagination";
import { db } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth/session";
import { Card, PageHeader, SectionTitle, cx } from "@/components/ui";
import { KnowledgeFiles, type KFile } from "@/components/KnowledgeFiles";
import { formatBytes } from "@/lib/knowledge/files";
import { Principles } from "./Principles";
import { DeleteCompanyButton, EditCompanyDialog, PortfolioForm } from "./PortfolioForm";


const OUTCOME: Record<string, { label: string; cls: string }> = {
  ACQUIRED: { label: "Acquired", cls: "bg-pos-bg text-pos" },
  IPO: { label: "IPO", cls: "bg-info-bg text-info" },
  MERGED: { label: "Merged", cls: "bg-info-bg text-info" },
  ACTIVE: { label: "Active", cls: "bg-brand-100 text-brand-600" },
  WOUND_DOWN: { label: "Wound down", cls: "bg-neg-bg text-neg" },
  UNKNOWN: { label: "Outcome n/a", cls: "bg-[#f1efea] text-muted" },
};

export default async function KnowledgePage({ searchParams }: PageProps<"/knowledge">) {
  const user = await requireUser();
  const sp = await searchParams;
  const canEdit = hasRole(user.role, "PARTNER");
  const [companies, principles, feedbackCount, kfiles] = await Promise.all([
    db.portfolioCompany.findMany({ orderBy: [{ outcome: "asc" }, { name: "asc" }] }),
    db.investmentPrinciple.findMany({ orderBy: { createdAt: "asc" } }),
    db.analysisFeedback.count(),
    db.knowledgeFile.findMany({
      where: { scope: { in: ["FIRM", "PORTFOLIO"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, scope: true, portfolioCompanyId: true, filename: true, sizeBytes: true, status: true, summary: true },
    }),
  ]);
  const toK = (f: (typeof kfiles)[number]): KFile => ({ id: f.id, filename: f.filename, size: formatBytes(f.sizeBytes), status: f.status, summary: f.summary });
  const firmFiles = kfiles.filter((f) => f.scope === "FIRM").map(toK);
  const filesFor = (companyId: string) => kfiles.filter((f) => f.portfolioCompanyId === companyId).map(toK);
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

      <Card className="mb-8">
        <SectionTitle eyebrow="Firm documents" title="Documents every analysis can draw on" />
        <p className="-mt-3 mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">
          Fund strategy, investment theses, IC memos, portfolio reviews, anything that explains how Genesys thinks. GAIA reads each file and uses its summary in every analysis.
        </p>
        <KnowledgeFiles scope="FIRM" files={firmFiles} canEdit={canEdit} />
      </Card>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
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
              {(canEdit || filesFor(c.id).length > 0) && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[12.5px] font-medium text-navy-700">Files ({filesFor(c.id).length})</summary>
                  <div className="mt-2"><KnowledgeFiles scope="PORTFOLIO" targetId={c.id} files={filesFor(c.id)} canEdit={canEdit} compact /></div>
                </details>
              )}
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
      <div className="mt-10" id="changes">
        <ChangeLog
          prefixes={["portfolio.", "principle.", "training.suggestion_accepted", "knowledge.files_added", "knowledge.file_removed"]}
          page={pageParam(sp.changes)}
          href={(p) => `/knowledge?changes=${p}#changes`}
          title="Changes to the knowledge base"
        />
      </div>
    </>
  );
}

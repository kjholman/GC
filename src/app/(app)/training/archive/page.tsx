import { db } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth/session";
import { Card, Empty, cx } from "@/components/ui";
import { AddHistoricalForm, ArchiveRowActions, ImportCsvForm } from "./ArchiveForms";


const DECISION: Record<string, { label: string; cls: string }> = {
  INVESTED: { label: "Invested", cls: "bg-pos-bg text-pos" },
  PASSED_AFTER_DILIGENCE: { label: "Passed after diligence", cls: "bg-warn-bg text-warn" },
  PASSED_AT_SCREENING: { label: "Declined at screen", cls: "bg-neg-bg text-neg" },
};

export default async function ArchivePage() {
  const user = await requireUser();
  const canEdit = hasRole(user.role, "PARTNER");
  const deals = await db.historicalDeal.findMany({
    orderBy: [{ decisionYear: "desc" }, { companyName: "asc" }],
    select: {
      id: true, companyName: true, decisionYear: true, decision: true, decisionRationale: true, outcome: true, outcomeNotes: true,
      sector: true, modality: true, indication: true, tags: true, digest: true, deckFilename: true, ingestStatus: true, ingestError: true,
    },
  });
  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <p className="mb-6 max-w-3xl text-[14px] leading-relaxed text-ink-soft">
          For each new deck, the Sharminator looks up the most similar past deals here: what the partners decided, why, and how it turned out. Original decks attached here are also used for accuracy tests. Include deals Genesys <em>declined</em>; they matter as much as investments.
        </p>
        {deals.length === 0 ? (
          <Empty title="No past deals yet">Import them from a spreadsheet, or add them one at a time.</Empty>
        ) : (
          <Card pad={false}>
            <ul className="divide-y divide-line">
              {deals.map((d) => (
                <li key={d.id} className="px-6 py-4">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-navy-900">
                          {d.companyName} <span className="ml-1 text-[12px] font-normal text-muted">{d.decisionYear ?? ""}</span>
                        </div>
                        <div className="truncate text-[12.5px] text-muted">{[d.sector, d.modality, d.indication].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                      <span className={cx("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", DECISION[d.decision].cls)}>{DECISION[d.decision].label}</span>
                      <span className="w-24 text-right text-[11.5px] text-muted">{d.outcome.replaceAll("_", " ").toLowerCase()}</span>
                      <span className={cx("w-24 text-right text-[11.5px]", d.ingestStatus === "READY" ? "text-pos" : d.ingestStatus === "FAILED" ? "text-neg" : "text-warn")}>
                        {d.ingestStatus === "READY" ? (d.deckFilename ? "● deck read" : "● ready") : d.ingestStatus === "FAILED" ? "couldn't read" : "reading…"}
                      </span>
                    </summary>
                    <div className="mt-4 grid grid-cols-1 gap-4 border-t border-line pt-4 text-[13px] md:grid-cols-2">
                      <div>
                        <div className="eyebrow mb-1">Partners&apos; rationale</div>
                        <p className="text-ink-soft">{d.decisionRationale}</p>
                        {d.outcomeNotes && (<><div className="eyebrow mt-3 mb-1">Outcome</div><p className="text-ink-soft">{d.outcomeNotes}</p></>)}
                      </div>
                      <div>
                        <div className="eyebrow mb-1">Sharminator&rsquo;s summary</div>
                        <p className="text-ink-soft">{d.digest ?? (d.ingestError ? <span className="text-neg">{d.ingestError}</span> : "Pending…")}</p>
                        {d.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {d.tags.map((t) => <span key={t} className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] text-navy-700">{t}</span>)}
                          </div>
                        )}
                      </div>
                      {canEdit && <div className="md:col-span-2"><ArchiveRowActions id={d.id} name={d.companyName} failed={d.ingestStatus === "FAILED"} /></div>}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      {canEdit && (
        <div className="space-y-6">
          <ImportCsvForm />
          <AddHistoricalForm />
        </div>
      )}
    </div>
  );
}

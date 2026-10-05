import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth/session";
import type { Memo } from "@/lib/ai/schema";
import { Button, Card, REC_META, ScoreRing, SectionTitle, StatusBadge, cx, fmtDate, relTime } from "@/components/ui";
import { AnalysisProgress } from "./AnalysisProgress";
import { CopyButton } from "./CopyButton";
import { FeedbackPanel, FollowUpPanel, NoteForm, RerunButton, SignOffPanel, StatusPanel } from "./DealActions";
import { EvidenceProvider } from "./Evidence";
import { EvidenceLedger, VerificationBanner } from "./Verification";
import type { VerificationReport } from "@/lib/ai/verify";
import { DiligenceView, FinancialsView, FitView, MemoView, Paras, RequestsView } from "./Memo";
import { PrintButton } from "./PrintButton";
import { Tabs } from "./Tabs";

export async function generateMetadata({ params }: PageProps<"/deals/[id]">) {
  const { id } = await params;
  const deal = await db.deal.findUnique({ where: { id }, select: { companyName: true } });
  return { title: deal?.companyName ?? "Deal" };
}

const KIND_LABEL: Record<string, string> = {
  PITCH_DECK: "Pitch deck",
  FINANCIAL_MODEL: "Financial model",
  SCIENTIFIC_DATA: "Scientific data",
  IP_DOCUMENTATION: "IP",
  CLINICAL_REGULATORY: "Clinical / regulatory",
  CORRESPONDENCE: "Correspondence",
  OTHER: "Other",
};

export default async function DealPage({ params, searchParams }: PageProps<"/deals/[id]">) {
  const user = await requireUser();
  const canPartner = hasRole(user.role, "PARTNER");
  const { id } = await params;
  const sp = await searchParams;

  const deal = await db.deal.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, email: true } },
      documents: {
        select: { id: true, filename: true, kind: true, round: true, sizeBytes: true, createdAt: true, uploadedBy: { select: { name: true, email: true } } },
        orderBy: [{ round: "asc" }, { createdAt: "asc" }],
      },
      analyses: {
        orderBy: { version: "desc" },
        include: { feedback: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, email: true } } } } },
      },
      activities: { orderBy: { createdAt: "desc" }, take: 60, include: { user: { select: { name: true, email: true } } } },
    },
  });
  if (!deal) notFound();

  const latest = deal.analyses[0];
  const inFlight = latest && (latest.status === "RUNNING" || latest.status === "QUEUED") ? latest : null;
  const completed = deal.analyses.filter((a) => a.status === "COMPLETE");
  const requestedV = typeof sp.v === "string" ? Number(sp.v) : null;
  const shown = (requestedV && completed.find((a) => a.version === requestedV)) || completed[0];
  const memo = shown?.memo as Memo | undefined;
  const failed = latest?.status === "FAILED" ? latest : null;
  const isLatestShown = shown && shown.id === completed[0]?.id;

  const rounds = [...new Set(deal.documents.map((d) => d.round))];
  const report = (shown?.verification as VerificationReport | null) ?? null;
  const signer = shown?.signedOffById ? await db.user.findUnique({ where: { id: shown.signedOffById }, select: { name: true, email: true } }) : null;
  const signedOff = shown?.signedOffAt && signer ? { by: signer.name ?? signer.email.split("@")[0], at: fmtDate(shown.signedOffAt, true), note: shown.signOffNote } : null;
  // Evidence tags are for internal review only; founder correspondence never carries them.
  const emailBody = memo ? memo.founderEmail.body.replace(/\s?\[E\d+\]/g, "") : "";
  const mailto = memo
    ? `mailto:${encodeURIComponent(deal.contactEmail ?? "")}?subject=${encodeURIComponent(memo.founderEmail.subject)}&body=${encodeURIComponent(emailBody)}`
    : "";
  const flaggedIds = new Set((report?.issues ?? []).map((i) => i.location.replace("evidence ", "")));
  const ledger = memo?.evidence?.map((e) => ({ id: e.id, claim: e.claim, sourceType: e.sourceType, sourceRef: e.sourceRef, status: e.status, flagged: flaggedIds.has(e.id) })) ?? [];

  return (
    <>
      <div className="no-print mb-6 text-[13px] text-muted">
        <Link href="/deals" className="hover:text-navy-800">Pipeline</Link> <span className="mx-1.5">/</span> {deal.companyName}
      </div>

      <header className="mb-8 grid gap-8 border-b border-line pb-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <StatusBadge status={deal.status} />
            {deal.sector && <span className="text-[12.5px] text-muted">{deal.sector}</span>}
            {deal.modality && <span className="text-[12.5px] text-muted">· {deal.modality}</span>}
          </div>
          <h1 className="font-serif text-[40px] leading-[1.05] tracking-[-0.015em] text-navy-900">{deal.companyName}</h1>
          {deal.oneLiner && <p className="mt-3 max-w-3xl font-serif text-[18px] italic leading-snug text-ink-soft">{deal.oneLiner}</p>}
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
            {[
              ["Stage", deal.stage],
              ["Round", deal.roundSize],
              ["Location", deal.location],
              ["Founder", deal.contactName ? `${deal.contactName}${deal.contactEmail ? ` · ${deal.contactEmail}` : ""}` : deal.contactEmail],
              ["Lead", deal.owner?.name ?? deal.owner?.email.split("@")[0]],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
            {deal.website && (
              <a href={deal.website.startsWith("http") ? deal.website : `https://${deal.website}`} target="_blank" rel="noreferrer" className="text-navy-700 hover:underline">
                {deal.website.replace(/^https?:\/\//, "")} ↗
              </a>
            )}
          </dl>
        </div>
        {memo && shown && (
          <div className="flex items-center gap-6 self-end">
            <div className="text-right">
              <div className="eyebrow">AI recommendation</div>
              <div className={cx("mt-1 font-serif text-[22px]", REC_META[memo.recommendation].cls)}>{REC_META[memo.recommendation].label}</div>
              <div className="mt-1 text-[12px] text-muted">
                {memo.conviction.toLowerCase()} conviction · v{shown.version} · {fmtDate(shown.completedAt)}
              </div>
            </div>
            <ScoreRing score={memo.overallScore} size={96} />
          </div>
        )}
      </header>

      {inFlight && (
        <div className="mb-8">
          <AnalysisProgress
            analysisId={inFlight.id}
            version={inFlight.version}
            initialProgress={inFlight.progress}
            startedAt={inFlight.startedAt?.toISOString() ?? null}
          />
        </div>
      )}
      {failed && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[3px] border border-[#efd2ce] bg-neg-bg px-6 py-4">
          <div>
            <div className="text-[13.5px] font-medium text-neg">Analysis v{failed.version} did not complete</div>
            <div className="mt-0.5 text-[13px] text-ink-soft">{failed.error}</div>
          </div>
          <RerunButton dealId={deal.id} disabled={false} />
        </div>
      )}
      {shown && !isLatestShown && (
        <div className="mb-8 rounded-[3px] border border-gold-300 bg-gold-100/60 px-6 py-3 text-[13px] text-ink-soft">
          Viewing historical version v{shown.version}.{" "}
          <Link href={`/deals/${deal.id}`} className="font-medium text-navy-800 underline">Return to latest</Link>
        </div>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {!memo ? (
            <Card className="py-16 text-center">
              <div className="mx-auto max-w-md">
                <div className="font-serif text-[22px] text-navy-900">{inFlight ? "The analyst is working on this deal." : "No completed analysis yet."}</div>
                <p className="mt-2 text-[14px] text-muted">
                  {inFlight
                    ? "The memo appears here automatically when it is ready. You can leave this page; the analysis continues in the background."
                    : "Re-run the analysis to produce a memo."}
                </p>
              </div>
            </Card>
          ) : (
            <EvidenceProvider evidence={ledger}>
            <div className="mb-8">
              <VerificationBanner report={report} signedOff={signedOff ? { by: signedOff.by, at: signedOff.at } : null} />
            </div>
            <Tabs
              key={shown!.id}
              tabs={[
                { id: "memo", label: "Investment memo", content: <MemoView memo={memo} /> },
                { id: "fin", label: "Financials & returns", content: <FinancialsView memo={memo} /> },
                { id: "fit", label: "Portfolio fit", content: <FitView memo={memo} /> },
                { id: "req", label: "Information requests", badge: memo.informationRequests.length, content: <RequestsView memo={memo} /> },
                { id: "dd", label: "Due diligence", badge: memo.dueDiligencePlan ? "✓" : undefined, content: <DiligenceView memo={memo} /> },
                {
                  id: "email",
                  label: "Founder response",
                  content: (
                    <Card>
                      <SectionTitle
                        eyebrow="Ready to send"
                        title="Response to the founders"
                        action={
                          signedOff ? (
                            <div className="no-print flex gap-2">
                              <CopyButton text={emailBody} label="Copy body" />
                              <CopyButton text={`Subject: ${memo.founderEmail.subject}\n\n${emailBody}`} label="Copy all" />
                              <a href={mailto}>
                                <Button>Open in mail</Button>
                              </a>
                            </div>
                          ) : (
                            <span className="no-print rounded-[3px] border border-gold-300 bg-gold-100/60 px-3 py-2 text-[12.5px] text-gold-600">
                              Locked until an analyst signs off the memo
                            </span>
                          )
                        }
                      />
                      <div className="rounded-[3px] border border-line bg-[#fbfaf7]">
                        <div className="border-b border-line px-6 py-3 text-[13px]">
                          <span className="text-muted">To: </span>
                          <span className="text-ink">{deal.contactEmail ?? "[founder email]"}</span>
                        </div>
                        <div className="border-b border-line px-6 py-3 text-[13px]">
                          <span className="text-muted">Subject: </span>
                          <span className="font-medium text-ink">{memo.founderEmail.subject}</span>
                        </div>
                        <pre className="whitespace-pre-wrap px-6 py-6 font-sans text-[14px] leading-[1.75] text-ink">{emailBody}</pre>
                      </div>
                      <p className="mt-4 text-[12px] text-muted">
                        Review before sending and replace [Your name] with your signature. Internal scores and evidence tags are never included in founder correspondence.
                      </p>
                    </Card>
                  ),
                },
                { id: "evidence", label: "Evidence", badge: memo.evidence?.length ?? 0, content: memo.evidence ? <EvidenceLedger memo={memo} report={report} /> : <Card><p className="text-[14px] text-muted">This memo predates the evidence ledger.</p></Card> },
                {
                  id: "research",
                  label: "Research brief",
                  content: (
                    <Card>
                      <SectionTitle eyebrow="Independent research" title="Web research brief" />
                      {shown.research ? (
                        <Paras text={shown.research} />
                      ) : (
                        <p className="text-[14px] text-muted">No web research was run for this version.</p>
                      )}
                    </Card>
                  ),
                },
                {
                  id: "docs",
                  label: "Documents & history",
                  badge: deal.documents.length,
                  content: (
                    <div className="space-y-8">
                      <Card pad={false}>
                        <div className="px-6 pt-6"><SectionTitle eyebrow="Data room" title="Materials received" /></div>
                        {rounds.map((r) => (
                          <div key={r}>
                            <div className="border-y border-line bg-ivory/60 px-6 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                              Round {r} · {r === 1 ? "Original submission" : "Follow-up information"}
                            </div>
                            <ul className="divide-y divide-line">
                              {deal.documents.filter((d) => d.round === r).map((d) => (
                                <li key={d.id} className="flex items-center gap-4 px-6 py-3 text-[13.5px]">
                                  <span className="w-32 shrink-0 text-[12px] text-muted">{KIND_LABEL[d.kind]}</span>
                                  <a href={`/api/documents/${d.id}`} target="_blank" className="min-w-0 flex-1 truncate text-navy-800 hover:underline">{d.filename}</a>
                                  <span className="text-[12px] tabular text-muted">{(d.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                                  <span className="w-28 text-right text-[12px] text-muted">{fmtDate(d.createdAt)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </Card>
                      <Card pad={false}>
                        <div className="px-6 pt-6"><SectionTitle eyebrow="Audit trail" title="Analysis versions" /></div>
                        <table className="w-full text-left text-[13.5px]">
                          <tbody className="divide-y divide-line border-t border-line">
                            {deal.analyses.map((a) => (
                              <tr key={a.id} className={cx(a.id === shown.id && "bg-gold-100/40")}>
                                <td className="py-3 pr-4 pl-6 font-serif text-[16px] text-navy-900">v{a.version}</td>
                                <td className="px-4 py-3 text-ink-soft">
                                  {a.trigger === "INITIAL_SCREEN" ? "Initial screen" : a.trigger === "NEW_INFORMATION" ? "New information" : "Re-run"}
                                </td>
                                <td className={cx("px-4 py-3 font-medium", a.recommendation ? REC_META[a.recommendation]?.cls : "text-muted")}>
                                  {a.recommendation ? REC_META[a.recommendation]?.label : a.status.toLowerCase()}
                                </td>
                                <td className="px-4 py-3 tabular text-ink">{a.overallScore ?? "—"}</td>
                                <td className="px-4 py-3 text-[12px] text-muted">{fmtDate(a.completedAt ?? a.createdAt, true)}</td>
                                <td className="py-3 pr-6 pl-4 text-right">
                                  {a.status === "COMPLETE" && a.id !== shown.id && (
                                    <Link href={`/deals/${deal.id}?v=${a.version}`} className="text-[12.5px] text-navy-700 hover:underline">View</Link>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Card>
                    </div>
                  ),
                },
              ]}
            />
            </EvidenceProvider>
          )}
        </div>

        <aside className="no-print space-y-6">
          <FollowUpPanel dealId={deal.id} disabled={!!inFlight} openRequests={memo?.informationRequests.length ?? 0} />
          {shown && (
            <SignOffPanel key={`so-${shown.id}`} analysisId={shown.id} version={shown.version} status={shown.verificationStatus} signedOff={signedOff} />
          )}
          {shown && canPartner && (
            <Link href={`/training/exemplars/new?analysis=${shown.id}`} className="block rounded-[3px] border border-line bg-paper px-5 py-4 text-[13px] text-navy-800 hover:border-navy-700">
              <span className="eyebrow block text-gold-600">Training Studio</span>
              Correct &amp; endorse as exemplar →
            </Link>
          )}
          {shown && (
            <FeedbackPanel
              key={shown.id}
              analysisId={shown.id}
              version={shown.version}
              reviews={shown.feedback.map((f) => ({ who: f.user.name ?? f.user.email.split("@")[0], verdict: f.verdict, comment: f.comment }))}
            />
          )}
          <StatusPanel key={deal.status} dealId={deal.id} status={deal.status} canPartner={canPartner} />
          <Card>
            <div className="eyebrow mb-3">Tools</div>
            <div className="flex flex-col items-start gap-1">
              <RerunButton dealId={deal.id} disabled={!!inFlight} />
              {memo && <PrintButton />}
            </div>
          </Card>
          <Card>
            <div className="eyebrow mb-4">Deal log</div>
            <NoteForm dealId={deal.id} />
            <ol className="mt-6 space-y-4">
              {deal.activities.map((a) => (
                <li key={a.id} className={cx("text-[13px]", a.type === "note" && "rounded-[3px] bg-gold-100/50 px-3 py-2")}>
                  <p className="leading-relaxed text-ink-soft">{a.message}</p>
                  <div className="mt-1 text-[11px] text-muted">
                    {a.user ? (a.user.name ?? a.user.email.split("@")[0]) : "AI analyst"} · {relTime(a.createdAt)}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </>
  );
}

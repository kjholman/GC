import Link from "next/link";
import { ANALYST_NAME } from "@/components/Analyst";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth/session";
import type { CompetitorSweep, Memo } from "@/lib/ai/schema";
import { Button, Card, REC_META, ScoreRing, SectionTitle, cx, fmtDate, relTime } from "@/components/ui";
import { AnalysisProgress } from "./AnalysisProgress";
import { DealLogo } from "@/components/DealLogo";
import { DealStatusBadge } from "@/components/DealStatus";
import { AnalystAvatar } from "@/components/Analyst";
import { MemeScene } from "@/components/MemeScene";
import { refreshSlug } from "@/lib/deals/slug";
import { formatUsd, spendByDeal } from "@/lib/ai/usage";
import { GapsView, PassReasons, SourcesList, VersionHistory, collectWebSources, type VersionRow } from "./History";
import { LogoEditor } from "./LogoEditor";
import { RemoveDocument } from "./RemoveDocument";
import { ensureDealLogo, fmtElapsed } from "@/lib/ai/analyst";
import { after } from "next/server";
import { StepLog, asSteps } from "./StepLog";
import { CopyButton } from "./CopyButton";
import { FeedbackPanel, FollowUpPanel, NoteForm, RerunButton, SignOffPanel, StatusPanel, ResumeButton } from "./DealActions";
import { EvidenceProvider } from "./Evidence";
import { EvidenceLedger, VerificationBanner } from "./Verification";
import { CompetitorsView } from "./Competitors";
import type { VerificationReport } from "@/lib/ai/verify";
import { DiligenceView, FinancialsView, FitView, IPView, MarketView, MemoView, Paras, RequestsView, TeamView } from "./Memo";
import { PrintButton } from "./PrintButton";
import { Tabs } from "./Tabs";

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

  const deal = await db.deal.findFirst({
    where: { OR: [{ slug: id }, { id }] },
    omit: { logo: true, researchDossier: true },
    include: {
      owner: { select: { name: true, email: true } },
      documents: {
        select: { id: true, filename: true, mimeType: true, kind: true, round: true, sizeBytes: true, createdAt: true, pageCount: true, uploadedBy: { select: { name: true, email: true } } },
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
  // Old links by id, or a deal renamed since: send to its current readable address.
  const slug = deal.slug ?? (await refreshSlug(deal.id));
  if (id !== slug) redirect(`/deals/${slug}${typeof sp.v === "string" ? `?v=${sp.v}` : ""}`);
  // Older deals: look for a logo the first time the page is opened.
  const portfolioCompany = deal.portfolioCompanyId
    ? await db.portfolioCompany.findUnique({ where: { id: deal.portfolioCompanyId }, select: { name: true, yearInvested: true } })
    : null;
  // Spreadsheets the company sent (financial models, cap tables), offered for download under Financials.
  const spreadsheets = deal.documents.filter(
    (d) => d.kind === "FINANCIAL_MODEL" || /spreadsheet|excel|csv/.test(d.mimeType) || /\.(xlsx?|xlsm|csv|numbers)$/i.test(d.filename),
  );
  // For the re-run dialog: the last instructions given and this deal's partner feedback.
  const lastInstructions = [...deal.analyses].sort((x, y) => y.version - x.version).find((a) => a.instructions)?.instructions ?? null;
  const feedbackHints = [...new Set(deal.analyses.flatMap((a) => a.feedback.map((f) => (f.lesson ?? f.comment).trim())).filter(Boolean))].slice(-6);
  if (!deal.logoMime || deal.logoOnDark === null) after(() => ensureDealLogo(deal.id).catch(() => {}));

  const latest = deal.analyses[0];
  const inFlight = latest && (latest.status === "RUNNING" || latest.status === "QUEUED") ? latest : null;
  const completed = deal.analyses.filter((a) => a.status === "COMPLETE");
  const requestedV = typeof sp.v === "string" ? Number(sp.v) : null;
  const shown = (requestedV && completed.find((a) => a.version === requestedV)) || completed[0];
  const memo = shown?.memo as Memo | undefined;
  const failed = latest?.status === "FAILED" || latest?.status === "STOPPED" ? latest : null;
  const paused = latest?.status === "PAUSED" ? latest : null;
  // First analysis still running: show only the progress view until the memo exists.
  const firstRun = !!inFlight && !memo;
  // Only offer "Founders replied?" when the memo actually asks the founders for something.
  const awaitingFounders = !!memo && ((memo.informationRequests?.length ?? 0) > 0 || (memo.dueDiligencePlan?.documentRequestList?.length ?? 0) > 0);
  const isLatestShown = shown && shown.id === completed[0]?.id;

  const rounds = [...new Set(deal.documents.map((d) => d.round))];
  const dealSpend = (await spendByDeal([deal.id])).get(deal.id) ?? 0;
  // Each analysis's measured spend (every AI request it made, including resumed attempts).
  const spendRows = await db.aiUsage.groupBy({ by: ["analysisId"], where: { analysisId: { in: deal.analyses.map((a) => a.id) } }, _sum: { usd: true } });
  const spendOf = new Map(spendRows.map((r) => [r.analysisId, r._sum.usd ?? 0]));
  // Time the analysis spent working: the sum of its recorded stages, or start to finish.
  const workedMs = (a: { timings: unknown; startedAt: Date | null; completedAt: Date | null }) => {
    const t = Array.isArray(a.timings) ? (a.timings as { stage: string; ms: number }[]).filter((x) => !/^(Memo|Correction): /.test(x.stage)) : [];
    if (t.length) return t.reduce((n, x) => n + x.ms, 0);
    return a.startedAt && a.completedAt ? a.completedAt.getTime() - a.startedAt.getTime() : null;
  };
  const runs = deal.analyses.filter((a) => a.status !== "QUEUED").length;
  const people = await db.user.findMany({ where: { id: { in: deal.analyses.map((a) => a.createdById).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } });
  const asc = [...deal.analyses].reverse();
  const versionRows: VersionRow[] = deal.analyses.map((a) => {
    const prevStart = asc.filter((x) => x.version < a.version).at(-1)?.createdAt ?? new Date(0);
    const who = people.find((p) => p.id === a.createdById);
    return {
      id: a.id, version: a.version, trigger: a.trigger, status: a.status, createdAt: a.createdAt, completedAt: a.completedAt,
      recommendation: a.recommendation, overallScore: a.overallScore, versionDelta: (a.memo as Memo | null)?.versionDelta ?? null,
      analystContext: a.analystContext, by: who ? who.name ?? who.email.split("@")[0] : null, costUsd: spendOf.get(a.id) ?? a.costUsd,
      newFiles: deal.documents.filter((d) => d.createdAt > prevStart && d.createdAt <= a.createdAt).map((d) => d.filename),
      files: deal.documents.filter((d) => d.createdAt <= a.createdAt).map((d) => d.filename),
      startedAt: a.startedAt,
      error: a.error,
      errorDetail: a.errorDetail,
      context: (a.contextUsed as VersionRow["context"]) ?? null,
      steps: asSteps(a.steps),
      instructions: a.instructions,
      reason: a.reason,
      timings: Array.isArray(a.timings) ? (a.timings as { stage: string; ms: number }[]) : [],
    };
  });
  const webSources = shown
    ? collectWebSources([
        { label: "research", text: shown.research },
        { label: "competitor sweep", text: shown.competitorNotes },
        { label: "memo", text: JSON.stringify((shown.memo as Memo | null)?.evidence ?? []) },
        { label: "competitor table", text: JSON.stringify(shown.competitors ?? null) },
      ])
    : [];
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

      <header className="mb-8 grid grid-cols-1 gap-8 border-b border-line pb-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <DealStatusBadge status={deal.status} latestAnalysis={latest?.status} finishedCount={completed.length} />
            {portfolioCompany && (
              <Link
                href="/knowledge"
                title={`Genesys invested${portfolioCompany.yearInvested ? ` in ${portfolioCompany.yearInvested}` : ""}. Analysed as a follow-on decision.`}
                className="rounded-full border border-brand-300 bg-brand-100/60 px-2.5 py-0.5 text-[11.5px] font-medium text-brand-700 hover:border-brand-500"
              >
                Genesys portfolio company{portfolioCompany.yearInvested ? ` · invested ${portfolioCompany.yearInvested}` : ""}
              </Link>
            )}
            {deal.sector && <span className="text-[12.5px] text-muted">{deal.sector}</span>}
            {deal.modality && <span className="text-[12.5px] text-muted">· {deal.modality}</span>}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex shrink-0 flex-col items-center gap-1">
              <DealLogo dealId={deal.id} name={deal.companyName} hasLogo={!!deal.logoMime} onDark={deal.logoOnDark} version={deal.logoCheckedAt?.getTime()} size={56} />
            </div>
            <h1 className="min-w-0 font-display font-semibold text-[32px] leading-[1.05] tracking-[-0.015em] text-navy-900 [overflow-wrap:anywhere] sm:text-[40px]">{deal.companyName}</h1>
          </div>
          <div className="mt-1.5"><LogoEditor dealId={deal.id} hasLogo={!!deal.logoMime} note={deal.logoNote} /></div>
          {deal.oneLiner && <p className="mt-3 max-w-3xl text-[16px] leading-relaxed text-ink-soft">{deal.oneLiner}</p>}
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
            {[
              ["AI cost so far", dealSpend > 0 ? `${formatUsd(dealSpend)} across ${runs} analys${runs === 1 ? "is" : "es"}` : null],
              ["Stage", deal.stage],
              ["Round", deal.roundSize],
              ["Location", deal.location],
              ["Founder", deal.contactName ? `${deal.contactName}${deal.contactEmail ? ` · ${deal.contactEmail}` : ""}` : deal.contactEmail],
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
              <div className="eyebrow flex items-center justify-end gap-2"><AnalystAvatar size={22} />GAIA recommends</div>
              <div className={cx("mt-1 font-display font-semibold text-[22px]", REC_META[memo.recommendation].cls)}>{REC_META[memo.recommendation].label}</div>
              <div className="mt-1 text-[12px] text-muted">
                {memo.conviction.toLowerCase()} conviction · v{shown.version} · {fmtDate(shown.completedAt)}
              </div>
              {(() => {
                const usd = spendOf.get(shown.id) ?? shown.costUsd;
                const ms = workedMs(shown);
                if (!usd && !ms) return null;
                return (
                  <div className="mt-0.5 text-[12px] text-muted">
                    This analysis: {usd ? `AI cost ${formatUsd(usd)}` : ""}
                    {usd && ms ? " · " : ""}
                    {ms ? `${fmtElapsed(ms)} of work` : ""}
                  </div>
                );
              })()}
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
            initialStage={inFlight.stage}
            initialSteps={asSteps(inFlight.steps)}
            avatar={<AnalystAvatar size={56} />}
            companyName={deal.companyName}
            startedAt={inFlight.startedAt?.toISOString() ?? null}
          />
        </div>
      )}
      {paused && (
        <div className="mb-8 rounded-lg border border-[#efdcb4] bg-warn-bg px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium text-warn">Analysis version {paused.version} is paused: the Anthropic account is out of credit</div>
              <p className="mt-0.5 text-[13px] text-ink-soft">
                Nothing is lost. Once credit is added to the Anthropic account, press Resume and GAIA carries on where it stopped, reusing everything it already finished. An administrator can also check credit on the Administration page, which resumes every paused analysis.
              </p>
              {asSteps(paused.steps).length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[12.5px] font-medium text-navy-800">See how far it got</summary>
                  <StepLog steps={asSteps(paused.steps)} className="mt-3" />
                </details>
              )}
            </div>
            <div className="flex items-center gap-4">
              <MemeScene scene="runway" size={150} className="hidden sm:block" />
              <ResumeButton analysisId={paused.id} />
            </div>
          </div>
        </div>
      )}
      {failed && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#efd2ce] bg-neg-bg px-6 py-4">
          <div>
            <div className="text-[13.5px] font-medium text-neg">{failed.status === "STOPPED" ? `Analysis version ${failed.version} was stopped` : `Analysis version ${failed.version} did not finish`}</div>
            <div className="mt-0.5 text-[13px] text-ink-soft">{failed.error}</div>
            {asSteps(failed.steps).length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[12.5px] font-medium text-navy-800">See how far it got</summary>
                <StepLog steps={asSteps(failed.steps)} className="mt-3" />
              </details>
            )}
          </div>
          <RerunButton dealId={deal.id} disabled={false} lastInstructions={lastInstructions} feedback={feedbackHints} lastRunUnfinished />
        </div>
      )}
      {memo && shown && deal.freshStartAt && deal.freshStartAt > (shown.completedAt ?? shown.createdAt) && !inFlight && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#efdcb4] bg-warn-bg px-5 py-4 sm:px-6">
          <p className="min-w-0 flex-1 text-[13.5px] text-ink">
            <span className="font-medium text-warn">A file was removed after this memo was written.</span> The memo below may still reflect it. Run the analysis again for a memo that doesn&apos;t use it.
          </p>
          <RerunButton dealId={deal.id} disabled={false} lastInstructions={lastInstructions} feedback={feedbackHints} lastRunUnfinished={!!failed} pausedId={paused?.id} />
        </div>
      )}
      {shown && !isLatestShown && (
        <div className="mb-8 rounded-lg border border-brand-300 bg-brand-100/60 px-6 py-3 text-[13px] text-ink-soft">
          Viewing historical version v{shown.version}.{" "}
          <Link href={`/deals/${slug}`} className="font-medium text-navy-800 underline">Return to latest</Link>
        </div>
      )}

      {firstRun ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <Card pad={false}>
          <div className="px-6 pt-6"><SectionTitle eyebrow="While you wait" title="Materials received" /></div>
          <ul className="divide-y divide-line border-t border-line">
            {deal.documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-[13.5px] sm:px-6">
                <a href={`/api/documents/${d.id}`} target="_blank" className="min-w-0 flex-1 truncate text-navy-800 hover:underline">{d.filename}</a>
                <span className="shrink-0 whitespace-nowrap text-[12px] tabular text-muted">{(d.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
              </li>
            ))}
          </ul>
        </Card>
        <MemeScene scene="slide31" size={240} className="mx-auto md:mx-0" />
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {!memo ? (
            <>
            <Card className="py-16 text-center">
              <div className="mx-auto max-w-md">
                <div className="font-display font-semibold text-[22px] text-navy-900">{inFlight ? "GAIA is working on this deal." : "No completed analysis yet."}</div>
                <p className="mt-2 text-[14px] text-muted">
                  {inFlight
                    ? "The memo appears here automatically when it is ready. You can leave this page; the analysis continues in the background."
                    : "Re-run the analysis to produce a memo."}
                </p>
              </div>
            </Card>
            {versionRows.length > 0 && <div className="mt-8"><VersionHistory dealPath={`/deals/${slug}`} rows={versionRows} shownId={null} /></div>}
            </>
          ) : (
            <EvidenceProvider evidence={ledger}>
            <div className="mb-8">
              <VerificationBanner report={report} signedOff={signedOff ? { by: signedOff.by, at: signedOff.at } : null} />
            </div>
            {memo.recommendation !== "ADVANCE_TO_DILIGENCE" && <div className="mb-8"><PassReasons memo={memo} /></div>}
            <Tabs
              key={shown!.id}
              tabs={[
                { id: "memo", label: "Investment memo", content: <MemoView memo={memo} webSourceCount={webSources.length} firstAnalysis={!deal.analyses.some((a) => a.version < shown!.version && a.status === "COMPLETE")} /> },
                { id: "gaps", label: "Gaps to close", badge: memo.gaps?.length || undefined, content: <GapsView memo={memo} /> },
                { id: "market", label: "Market", content: <MarketView memo={memo} /> },
                { id: "ip", label: "IP", badge: memo.intellectualProperty.assets?.length, content: <IPView memo={memo} /> },
                { id: "team", label: "Team", badge: memo.team.members?.length, content: <TeamView memo={memo} /> },
                {
                  id: "fin",
                  label: "Financials & returns",
                  content: (
                    <div className="space-y-8">
                      <Card>
                        <SectionTitle eyebrow="Excel" title="Financial models" />
                        <ul className="divide-y divide-line text-[13.5px]">
                          <li className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <span className="min-w-0">
                              <span className="block font-medium text-navy-900">Return and market model (v{shown!.version})</span>
                              <span className="block text-[12.5px] text-muted">Built from this memo: scenarios with live formulas, expected multiple and IRR, milestones and market sizing. Change the blue inputs to test assumptions.</span>
                            </span>
                            <a href={`/api/analyses/${shown!.id}/model`} className="shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-navy-800 hover:border-navy-700">⇩ Download .xlsx</a>
                          </li>
                          {spreadsheets.map((d) => (
                            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                              <span className="min-w-0">
                                <span className="block truncate font-medium text-navy-900">{d.filename}</span>
                                <span className="block text-[12.5px] text-muted">Submitted by the company{d.round > 1 ? ` (round ${d.round})` : ""} · {(d.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                              </span>
                              <a href={`/api/documents/${d.id}`} download={d.filename} className="shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-[13px] font-medium text-navy-800 hover:border-navy-700">⇩ Download</a>
                            </li>
                          ))}
                        </ul>
                      </Card>
                      <FinancialsView memo={memo} />
                    </div>
                  ),
                },
                {
                  id: "comp",
                  label: "Competitive landscape",
                  badge: (shown!.competitors as CompetitorSweep | null)?.competitors.length,
                  content: <CompetitorsView sweep={(shown!.competitors as CompetitorSweep | null) ?? null} memo={memo} />,
                },
                { id: "fit", label: "Portfolio fit", content: <FitView memo={memo} /> },
                { id: "req", label: "Information requests", badge: memo.informationRequests.length, content: <RequestsView memo={memo} /> },
                { id: "dd", label: "Due diligence", badge: memo.dueDiligencePlan ? "✓" : undefined, content: <DiligenceView memo={memo} /> },
                // A deal that does not pass screening gets no founder response.
                ...(memo.recommendation !== "REJECT" && memo.founderEmail.body.trim()
                  ? [
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
                                <span className="no-print rounded-lg border border-brand-300 bg-brand-100/60 px-3 py-2 text-[12.5px] text-brand-600">
                                  Locked until an analyst signs off the memo
                                </span>
                              )
                            }
                          />
                          <div className="rounded-lg border border-line bg-[#fbfaf7]">
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
                    ]
                  : []),
                {
                  id: "evidence",
                  label: "Sources",
                  badge: (memo.evidence?.length ?? 0) + webSources.length,
                  content: (
                    <div className="space-y-8">
                      {memo.evidence ? <EvidenceLedger memo={memo} report={report} /> : <Card><p className="text-[14px] text-muted">This memo was written before source tracking was added.</p></Card>}
                      <SourcesList documents={deal.documents.filter((d) => d.createdAt <= (shown.createdAt ?? new Date()))} web={webSources} />
                    </div>
                  ),
                },
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
                  label: "Documents & versions",
                  badge: deal.documents.length,
                  content: (
                    <div className="space-y-8">
                      <Card pad={false}>
                        <div className="px-6 pt-6"><SectionTitle eyebrow="Documents" title="Materials received" /></div>
                        {rounds.map((r) => (
                          <div key={r}>
                            <div className="border-y border-line bg-mist/60 px-6 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                              Round {r} · {r === 1 ? "Original submission" : "Follow-up information"}
                            </div>
                            <ul className="divide-y divide-line">
                              {deal.documents.filter((d) => d.round === r).map((d) => (
                                <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-[13.5px] sm:gap-4 sm:px-6">
                                  <span className="hidden w-32 shrink-0 text-[12px] text-muted sm:block">{KIND_LABEL[d.kind]}</span>
                                  <a href={`/api/documents/${d.id}`} target="_blank" className="min-w-0 flex-1 truncate text-navy-800 hover:underline">{d.filename}</a>
                                  <span className="shrink-0 whitespace-nowrap text-[12px] tabular text-muted">{(d.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                                  <span className="hidden w-28 text-right text-[12px] text-muted sm:block">{fmtDate(d.createdAt)}</span>
                                  {!inFlight && <RemoveDocument id={d.id} filename={d.filename} />}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </Card>
                      {asSteps(shown.steps).length > 0 && (
                        <Card>
                          <SectionTitle eyebrow={`Version ${shown.version}`} title="How GAIA did this analysis" />
                          <StepLog steps={asSteps(shown.steps)} />
                        </Card>
                      )}
                      <VersionHistory dealPath={`/deals/${slug}`} rows={versionRows} shownId={shown.id} />
                    </div>
                  ),
                },
              ]}
            />
            </EvidenceProvider>
          )}
        </div>

        <aside className="no-print space-y-6">
          {memo && shown && (
            <Card>
              <div className="eyebrow mb-3">GAIA says</div>
              {memo.meme?.top || memo.meme?.bottom ? (
                <MemeScene scene={memo.meme.scene} top={memo.meme.top} bottom={memo.meme.bottom} size={272} className="mx-auto" />
              ) : (
                <MemeScene scene={({ REJECT: "mice", PENDING_INFO: "blot", ADVANCE_TO_DILIGENCE: "pvalue" } as const)[memo.recommendation]} size={272} className="mx-auto" />
              )}
            </Card>
          )}
          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <div className="eyebrow">Materials ({deal.documents.length})</div>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1 text-[13px]">
              {deal.documents.map((d) => (
                <li key={d.id} className="flex items-baseline gap-2">
                  <a href={`/api/documents/${d.id}`} target="_blank" className="min-w-0 flex-1 truncate text-navy-800 hover:underline" title={d.filename}>{d.filename}</a>
                  <span className="shrink-0 text-[11.5px] text-muted">round {d.round}</span>
                  {!inFlight && <RemoveDocument id={d.id} filename={d.filename} />}
                </li>
              ))}
            </ul>
          </Card>
          {(memo || !inFlight) && (
            <FollowUpPanel key={`fu-${awaitingFounders}`} dealId={deal.id} disabled={!!inFlight} openRequests={memo?.informationRequests.length ?? 0} awaitingFounders={awaitingFounders} />
          )}
          {shown && (
            <SignOffPanel key={`so-${shown.id}`} analysisId={shown.id} version={shown.version} status={shown.verificationStatus} signedOff={signedOff} />
          )}
          {shown && canPartner && (
            <Link href={`/training/exemplars/new?analysis=${shown.id}`} className="block rounded-lg border border-line bg-paper px-5 py-4 text-[13px] text-navy-800 hover:border-navy-700">
              <span className="eyebrow block text-brand-600">Training Studio</span>
              Correct this memo and save as an example →
            </Link>
          )}
          {shown && (
            <FeedbackPanel
              key={shown.id}
              analysisId={shown.id}
              version={shown.version}
              reviews={shown.feedback.map((f) => ({ who: f.user.name ?? f.user.email.split("@")[0], verdict: f.verdict, comment: f.comment, areas: f.areas, lesson: f.lesson, appliesTo: f.appliesTo }))}
            />
          )}
          <StatusPanel key={deal.status} dealId={deal.id} status={deal.status} canPartner={canPartner} />
          <Card>
            <div className="eyebrow mb-3">Tools</div>
            <div className="flex flex-col items-start gap-1">
              <RerunButton dealId={deal.id} disabled={!!inFlight} lastInstructions={lastInstructions} feedback={feedbackHints} lastRunUnfinished={!!failed} pausedId={paused?.id} />
              {memo && shown && (
                <a href={`/api/analyses/${shown.id}/memo`} className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-medium text-navy-800 transition-colors hover:bg-navy-50">
                  ⇩ Download memo (Word)
                </a>
              )}
              {memo && <PrintButton />}
            </div>
          </Card>
          <Card>
            <div className="eyebrow mb-4">Deal log</div>
            <NoteForm dealId={deal.id} />
            <ol className="mt-6 space-y-4">
              {deal.activities.map((a) => (
                <li key={a.id} className={cx("text-[13px]", a.type === "note" && "rounded-lg bg-brand-100/50 px-3 py-2")}>
                  <p className="leading-relaxed text-ink-soft">{a.message}</p>
                  <div className="mt-1 text-[11px] text-muted">
                    {a.user ? (a.user.name ?? a.user.email.split("@")[0]) : ANALYST_NAME} · {relTime(a.createdAt)}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
      )}
    </>
  );
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Analysis, DealStatus, Document, Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { getFirmSettings } from "../training/settings";
import { findPrecedents } from "../training/retrieval";
import { familyOf } from "./extract";
import { FALLBACK_BETA, anthropic, structuredCall, textOf, type ContentBlock } from "./client";
import { plainPunctuation } from "./style";
import { automatedChecks, correctionsBlock, modelFactCheck, sourceTexts, summarise } from "./verify";
import { CompetitorSweepSchema, FingerprintSchema, MemoSchema, normaliseMemo, type CompetitorSweep, type Fingerprint, type Memo } from "./schema";

export { anthropic, structuredCall, type ContentBlock };

/** Requests are capped at 32 MB; base64 adds ~33%, so keep raw binaries under this. */
const BINARY_BUDGET_BYTES = 20 * 1024 * 1024;
import {
  ANALYST_PROFILE,
  COMPETITOR_EXTRACT_PROMPT,
  COMPETITOR_SWEEP_PROMPT,
  competitorBlock,
  FINGERPRINT_PROMPT,
  METHODOLOGY,
  RESEARCH_PROMPT,
  asOfInstruction,
  firmContextBlock,
  precedentsBlock,
  type CalibrationExample,
  type Precedents,
} from "./prompts";

export const STATUS_FOR_RECOMMENDATION: Record<Memo["recommendation"], DealStatus> = {
  REJECT: "REJECTED",
  PENDING_INFO: "PENDING_INFO",
  ADVANCE_TO_DILIGENCE: "DILIGENCE",
};

async function setProgress(id: string, progress: string) {
  await db.analysis.update({ where: { id }, data: { progress } });
}

type FileLike = { filename: string; mimeType: string; sizeBytes: number; data: Uint8Array; extractedText: string | null };

/** Convert one stored file into model content blocks (native PDF/image, or extracted text). */
export function fileBlocks(file: FileLike, context: string): ContentBlock[] {
  if (file.extractedText != null) {
    return [{
      type: "document",
      source: { type: "text", media_type: "text/plain", data: file.extractedText || "(no extractable text)" },
      title: file.filename,
      context,
    }];
  }
  const data = Buffer.from(file.data).toString("base64");
  const family = familyOf(file.mimeType);
  if (family === "pdf") {
    return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: file.filename, context }];
  }
  if (family === "image") {
    return [
      { type: "text", text: `Image: ${file.filename}. ${context}` },
      { type: "image", source: { type: "base64", media_type: file.mimeType as "image/png" | "image/jpeg" | "image/webp", data } },
    ];
  }
  return [];
}

/** Convert a deal's documents into content blocks, newest round first, within the request budget. */
function documentBlocks(docs: Document[]): { blocks: ContentBlock[]; omitted: string[] } {
  const sorted = [...docs].sort((a, b) => b.round - a.round || b.createdAt.getTime() - a.createdAt.getTime());
  const blocks: ContentBlock[] = [];
  const omitted: string[] = [];
  let binaryBytes = 0;
  for (const doc of sorted) {
    const context = `Submitted in round ${doc.round}${doc.round === 1 ? " (original pitch)" : " (follow-up information)"}; category: ${doc.kind.replaceAll("_", " ").toLowerCase()}.`;
    if (doc.extractedText == null) {
      if (binaryBytes + doc.sizeBytes > BINARY_BUDGET_BYTES) {
        omitted.push(doc.filename);
        continue;
      }
      binaryBytes += doc.sizeBytes;
    }
    blocks.push(...fileBlocks(doc, context));
  }
  return { blocks, omitted };
}

/** Classify an opportunity so similar historical deals can be retrieved. */
export async function fingerprint(docs: ContentBlock[]): Promise<Fingerprint> {
  const { data } = await structuredCall({
    schema: FingerprintSchema,
    effort: "low",
    maxTokens: 8000,
    content: [...docs, { type: "text", text: FINGERPRINT_PROMPT }],
  });
  return { ...data, tags: data.tags.map((t) => t.toLowerCase().trim()).filter(Boolean).slice(0, 15) };
}

/** Agentic web research with server-side search/fetch; returns sourced notes. */
async function webResearch(prompt: string, docs: ContentBlock[], limits: { search: number; fetch: number }): Promise<string | null> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: [...docs, { type: "text", text: prompt }] }];
  for (let turn = 0; turn < 8; turn++) {
    const stream = anthropic().beta.messages.stream({
      model: env.anthropicModel,
      max_tokens: 48000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: limits.search },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: limits.fetch },
      ],
      messages,
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === "refusal") return null;
    if (response.stop_reason === "pause_turn") {
      // Server-side tool loop hit its iteration limit; resume where it left off.
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    return plainPunctuation(textOf(response.content).trim()) || null;
  }
  return null;
}

/** Stage 1: background research on the company, science, regulatory precedent and contradictions. */
function researchBrief(companyName: string, docs: ContentBlock[]) {
  return webResearch(`Company under review: ${companyName}.\n\n${RESEARCH_PROMPT}`, docs, { search: 12, fetch: 8 });
}

const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;
const cleanUrl = (u: string) => u.replace(/[.,;]+$/, "");

/**
 * Stage 2: competitive sweep. A search pass dedicated to companies doing the same
 * thing (funding rounds, investors, outcomes), then a strict extraction into a
 * table. Entries whose sources do not appear in the research notes are dropped.
 */
export async function competitorSweep(companyName: string, docs: ContentBlock[]): Promise<{ notes: string; sweep: CompetitorSweep } | null> {
  const notes = await webResearch(`Company under review: ${companyName}.\n\n${COMPETITOR_SWEEP_PROMPT}`, docs, { search: 25, fetch: 15 });
  if (!notes) return null;
  const { data } = await structuredCall({
    schema: CompetitorSweepSchema,
    effort: "medium",
    maxTokens: 32000,
    content: [{ type: "text", text: `${COMPETITOR_EXTRACT_PROMPT}\n\n## Research notes\n${notes}` }],
  });
  const noteUrls = new Set([...notes.matchAll(URL_RE)].map((m) => cleanUrl(m[0])));
  const inNotes = (u: string) => noteUrls.has(cleanUrl(u)) || [...noteUrls].some((n) => n.startsWith(cleanUrl(u)) || cleanUrl(u).startsWith(n));
  let dropped = 0;
  const competitors = data.competitors
    .map((c) => ({
      ...c,
      sources: c.sources.filter(inNotes),
      fundingRounds: c.fundingRounds.map((r) => ({ ...r, sourceUrl: r.sourceUrl && inNotes(r.sourceUrl) ? r.sourceUrl : null })),
    }))
    .filter((c) => {
      if (c.sources.length) return true;
      dropped++;
      return false;
    });
  const kept = new Set(competitors.map((c) => c.name));
  return {
    notes,
    sweep: {
      ...data,
      competitors,
      activeInvestors: data.activeInvestors
        .map((i) => ({ ...i, backedCompanies: i.backedCompanies.filter((b) => kept.has(b)) }))
        .filter((i) => i.backedCompanies.length),
      gaps: dropped ? `${data.gaps} ${dropped} compan${dropped === 1 ? "y was" : "ies were"} removed because no supporting source could be confirmed.`.trim() : data.gaps,
    },
  };
}

/** system[1]: firm parameters, principles, calibration, portfolio and recent decisions. */
export async function buildFirmContext(opts: { excludeDealId?: string } = {}) {
  const [settings, principles, feedback, portfolio, pipeline] = await Promise.all([
    getFirmSettings(),
    db.investmentPrinciple.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    db.analysisFeedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        user: { select: { role: true } },
        analysis: { select: { recommendation: true, overallScore: true, deal: { select: { companyName: true } } } },
      },
    }),
    db.portfolioCompany.findMany({ orderBy: [{ outcome: "asc" }, { name: "asc" }] }),
    db.deal.findMany({
      where: { ...(opts.excludeDealId ? { id: { not: opts.excludeDealId } } : {}), latestScore: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: { companyName: true, sector: true, status: true, latestScore: true },
    }),
  ]);
  const calibration: CalibrationExample[] = feedback.map((f) => ({
    companyName: f.analysis.deal.companyName,
    aiRecommendation: f.analysis.recommendation,
    aiScore: f.analysis.overallScore,
    verdict: f.verdict,
    correctedRecommendation: f.correctedRecommendation,
    comment: f.comment,
    reviewerRole: f.user.role,
  }));
  return firmContextBlock({ settings, principles, calibration, portfolio, pipeline });
}

export function systemBlocks(firmContext: string): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    { type: "text", text: `${ANALYST_PROFILE}\n\n${METHODOLOGY}`, cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: firmContext, cache_control: { type: "ephemeral" } },
  ];
}

function priorAnalysesBlock(prior: Analysis[]): string | null {
  const complete = prior.filter((a) => a.status === "COMPLETE" && a.memo);
  if (!complete.length) return null;
  const latest = complete[complete.length - 1];
  const history = complete
    .map((a) => `- v${a.version} (${a.completedAt?.toISOString().slice(0, 10)}): ${a.recommendation}, score ${a.overallScore}${a.analystContext ? `; team note: "${a.analystContext}"` : ""}`)
    .join("\n");
  return ["## Prior analyses of this deal", history, "", `### Most recent memo (v${latest.version}), in full`, "```json", JSON.stringify(latest.memo), "```"].join("\n");
}

/** The underwriting core, shared by live analyses and backtests. */
export async function underwrite(args: {
  companyName: string;
  docs: ContentBlock[];
  firmContext: string;
  precedents: Precedents;
  research: string | null;
  competitors?: CompetitorSweep | null;
  omitted?: string[];
  prior?: Analysis[];
  analystContext?: string | null;
  backtest?: { year: number | null };
  corrections?: string;
}) {
  const priorBlock = args.prior ? priorAnalysesBlock(args.prior) : null;
  const precedents = precedentsBlock(args.precedents);
  const task = [
    priorBlock
      ? `New information has been received for ${args.companyName}. Re-assess the opportunity using everything attached (documents from every round) and the prior memo below. Write a complete, updated memo, not a diff, and explain what changed in versionDelta.`
      : `Screen this opportunity (${args.companyName}) and write the investment memo.`,
    args.backtest ? asOfInstruction(args.backtest.year) : "",
    args.analystContext ? `\n## Note from the Genesys team\n${args.analystContext}` : "",
    args.omitted?.length
      ? `\nThese earlier files were too large to re-attach this round; rely on the prior memo for their content: ${args.omitted.join(", ")}.`
      : "",
    priorBlock ? `\n${priorBlock}` : "",
    args.competitors ? `\n${competitorBlock(JSON.stringify(args.competitors))}` : "\n(No competitive sweep was available. Base market.comparableOutcomes on the materials and research brief, and flag that a full competitor sweep is outstanding.)",
    precedents ? `\n${precedents}` : "\n(No sufficiently similar precedents in Genesys' deal archive; set portfolioFit.historicalPrecedents to an empty list.)",
    args.research
      ? `\n## Independent research brief (live web research, compiled before this memo)\n${args.research}`
      : "\n(No independent web research for this analysis. Rely on the materials and your own knowledge, and flag anything that needs verification.)",
    args.corrections ? `\n${args.corrections}` : "",
  ].join("\n");

  const { data, usage, model } = await structuredCall({
    schema: MemoSchema,
    effort: env.analysisEffort,
    system: systemBlocks(args.firmContext),
    content: [...args.docs, { type: "text", text: task }],
  });
  return { memo: normaliseMemo(data), usage, model };
}

function precedentsSummary(p: Precedents) {
  return {
    historical: p.historical.map((h) => ({ id: h.id, companyName: h.companyName, decision: h.decision, outcome: h.outcome, why: h.why })),
    exemplars: p.exemplars.map((e) => ({ id: e.id, title: e.title, why: e.why })),
  };
}

/** Runs one live analysis end-to-end. Safe to call from a background task. */
export async function runAnalysis(analysisId: string): Promise<void> {
  const analysis = await db.analysis.findUnique({
    where: { id: analysisId },
    include: { deal: { include: { documents: true } } },
  });
  if (!analysis || analysis.status === "COMPLETE") return;
  const { deal } = analysis;

  await db.analysis.update({
    where: { id: analysisId },
    data: { status: "RUNNING", startedAt: new Date(), progress: "Reading submitted materials", error: null },
  });

  try {
    const prior = await db.analysis.findMany({
      where: { dealId: deal.id, version: { lt: analysis.version } },
      orderBy: { version: "asc" },
    });
    const { blocks, omitted } = documentBlocks(deal.documents);
    if (!blocks.length) throw new Error("No readable documents are attached to this deal.");

    // Fingerprint the deal (once, or again when new materials arrive) to find precedents.
    let probe: { sector: string | null; modality: string | null; indication: string | null; tags: string[] } = deal;
    if (!deal.tags.length || analysis.trigger !== "INITIAL_SCREEN") {
      const fp = await fingerprint(blocks).catch((err) => {
        console.error("[analyst] fingerprint failed; continuing", err);
        return null;
      });
      if (fp) {
        probe = { sector: fp.sector, modality: fp.modality, indication: fp.indication, tags: fp.tags };
        await db.deal.update({
          where: { id: deal.id },
          data: { tags: fp.tags, indication: deal.indication ?? fp.indication, sector: deal.sector ?? fp.sector, modality: deal.modality ?? fp.modality },
        });
      }
    }
    await setProgress(analysisId, "Retrieving precedents from Genesys' deal history");
    const precedents = await findPrecedents(probe);

    // Re-use earlier research on follow-ups unless none exists yet.
    let research = [...prior].reverse().find((a) => a.research)?.research ?? null;
    if (env.webResearchEnabled && (!research || analysis.trigger === "RERUN")) {
      await setProgress(analysisId, "Researching science, competitors and comparable deals");
      research = await researchBrief(deal.companyName, blocks).catch((err) => {
        console.error("[analyst] research stage failed; continuing without it", err);
        return null;
      });
    }

    // Competitive sweep: re-used on follow-ups unless a full re-run is requested.
    const priorSweep = [...prior].reverse().find((a) => a.competitors);
    let competitors = (priorSweep?.competitors as CompetitorSweep | undefined) ?? null;
    let competitorNotes = priorSweep?.competitorNotes ?? null;
    if (env.webResearchEnabled && (!competitors || analysis.trigger === "RERUN")) {
      await setProgress(analysisId, "Sweeping competitors: funding, investors and outcomes");
      const swept = await competitorSweep(deal.companyName, blocks).catch((err) => {
        console.error("[analyst] competitor sweep failed; continuing without it", err);
        return null;
      });
      if (swept) {
        competitors = swept.sweep;
        competitorNotes = swept.notes;
      }
    }
    // Everything retrieved from the web is a citable source for the fact-check.
    const webSources = [research, competitorNotes].filter(Boolean).join("\n\n") || null;

    await setProgress(analysisId, prior.length ? "Underwriting the new information" : "Underwriting: science, financials and fit");
    const firmContext = await buildFirmContext({ excludeDealId: deal.id });
    const underwriteArgs = {
      companyName: deal.companyName,
      docs: blocks,
      omitted,
      prior,
      research,
      competitors,
      precedents,
      firmContext,
      analystContext: analysis.analystContext,
    };
    const draft = await underwrite(underwriteArgs);
    let memo = draft.memo;
    const usage = { ...draft.usage };
    const model = draft.model;

    // ── Verification: deterministic checks + independent fact-check, one revision if needed.
    await setProgress(analysisId, "Fact-checking every claim against the sources");
    const portfolioNames = (await db.portfolioCompany.findMany({ select: { name: true } })).map((p) => p.name);
    const verifyCtx = {
      sources: await sourceTexts(deal.documents),
      research: webSources,
      portfolioNames,
      precedentNames: precedents.historical.map((h) => h.companyName),
    };
    const precedentsText = precedentsBlock(precedents);
    const check = async (m: Memo, revisions: number) => {
      const auto = automatedChecks(m, verifyCtx);
      const fact = await modelFactCheck({ memo: auto.sanitized, docs: blocks, research: webSources, precedentsText }).catch((err) => {
        console.error("[analyst] fact-check failed", err);
        return null;
      });
      return { memo: auto.sanitized, report: summarise(auto, fact, auto.sanitized, revisions) };
    };
    let checked = await check(memo, 0);
    const serious = checked.report.issues.filter((i) => i.severity !== "LOW");
    if (checked.report.status === "FAILED" && serious.length) {
      await setProgress(analysisId, "Correcting issues flagged by the fact-checker");
      const revised = await underwrite({ ...underwriteArgs, corrections: correctionsBlock(serious) });
      usage.input_tokens += revised.usage.input_tokens;
      usage.output_tokens += revised.usage.output_tokens;
      await setProgress(analysisId, "Re-checking the corrected memo");
      checked = await check(revised.memo, 1);
    }
    memo = checked.memo;
    const report = checked.report;

    const status = STATUS_FOR_RECOMMENDATION[memo.recommendation];
    await db.$transaction([
      db.analysis.update({
        where: { id: analysisId },
        data: {
          status: "COMPLETE",
          progress: null,
          completedAt: new Date(),
          memo: memo as unknown as Prisma.InputJsonValue,
          research,
          competitorNotes,
          competitors: (competitors ?? undefined) as unknown as Prisma.InputJsonValue,
          precedents: precedentsSummary(precedents) as unknown as Prisma.InputJsonValue,
          verification: report as unknown as Prisma.InputJsonValue,
          verificationStatus: report.status,
          revisions: report.revisions,
          recommendation: memo.recommendation,
          overallScore: memo.overallScore,
          model,
          inputTokens: usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
          outputTokens: usage.output_tokens,
        },
      }),
      db.deal.update({
        where: { id: deal.id },
        data: {
          status,
          latestScore: memo.overallScore,
          recommendation: memo.recommendation,
          oneLiner: deal.oneLiner ?? memo.company.oneLiner,
          sector: deal.sector ?? memo.company.sector,
          modality: deal.modality ?? memo.company.modality,
          indication: deal.indication ?? memo.company.leadIndication,
          stage: deal.stage ?? memo.company.developmentStage,
          location: deal.location ?? memo.company.headquarters,
          roundSize: deal.roundSize ?? memo.company.roundSought,
          website: deal.website ?? memo.company.website,
          contactName: deal.contactName ?? memo.company.founderContactName,
          contactEmail: deal.contactEmail ?? memo.company.founderContactEmail,
          companyName: deal.companyName.startsWith("Untitled") ? memo.company.name : deal.companyName,
        },
      }),
      db.activity.create({
        data: {
          dealId: deal.id,
          type: "analysis.complete",
          message: `AI analysis v${analysis.version} complete: ${memo.recommendation.replaceAll("_", " ").toLowerCase()} (score ${memo.overallScore}); fact-check ${report.status.toLowerCase()}${report.revisions ? " after one correction round" : ""}. Awaiting analyst sign-off.`,
        },
      }),
    ]);
  } catch (err) {
    const message = describeError(err);
    console.error("[analyst] analysis failed", analysisId, err);
    await db.analysis.update({
      where: { id: analysisId },
      data: { status: "FAILED", progress: null, error: message.slice(0, 2000), completedAt: new Date() },
    });
    await db.activity.create({
      data: { dealId: deal.id, type: "analysis.failed", message: `AI analysis v${analysis.version} failed: ${message.slice(0, 300)}` },
    });
  }
}

export function describeError(err: unknown): string {
  return err instanceof Anthropic.APIError
    ? `Model API error (${err.status ?? "network"}): ${err.message}`
    : err instanceof Error
      ? err.message
      : String(err);
}

/** Mark work orphaned by a server restart as failed so it can be re-run. */
export async function recoverStaleAnalyses() {
  const cutoff = new Date(Date.now() - 45 * 60 * 1000);
  await db.analysis.updateMany({
    where: { status: { in: ["RUNNING", "QUEUED"] }, createdAt: { lt: cutoff } },
    data: { status: "FAILED", error: "Interrupted by a server restart. Re-run the analysis.", progress: null },
  });
  await db.backtestRun.updateMany({
    where: { status: { in: ["RUNNING", "QUEUED"] }, createdAt: { lt: cutoff } },
    data: { status: "FAILED", error: "Interrupted by a server restart." },
  });
  await db.historicalDeal.updateMany({
    where: { ingestStatus: "PROCESSING", updatedAt: { lt: cutoff } },
    data: { ingestStatus: "FAILED", ingestError: "Interrupted by a server restart. Retry ingestion." },
  });
}

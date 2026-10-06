import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Analysis, DealStatus, Document, Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { getFirmSettings } from "../training/settings";
import { findPrecedents } from "../training/retrieval";
import { coverageNote, prepareFiles, type InputFile, type PreparedFiles } from "./files";
import { FALLBACK_BETA, anthropic, structuredCall, textOf, type ContentBlock } from "./client";
import { plainPunctuation } from "./style";
import { isCreditError, recordCreditOk, recordCreditProblem } from "./credit";
import { FEEDBACK_AREA_LABEL } from "../feedback/options";
import { automatedChecks, correctionsBlock, modelFactCheck, sourceTexts, summarise } from "./verify";
import { CompetitorSweepSchema, FingerprintSchema, MemoSchema, normaliseMemo, type CompetitorSweep, type Fingerprint, type Memo } from "./schema";

import {
  ANALYST_PROFILE,
  COMPETITOR_EXTRACT_PROMPT,
  COMPETITOR_SWEEP_PROMPT,
  FOUNDER_RESEARCH_PROMPT,
  IP_RESEARCH_PROMPT,
  MARKET_RESEARCH_PROMPT,
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

export { anthropic, structuredCall, type ContentBlock };

const RECOMMENDATION_TEXT: Record<Memo["recommendation"], string> = {
  REJECT: "recommends declining",
  PENDING_INFO: "needs more information from the founders",
  ADVANCE_TO_DILIGENCE: "recommends advancing to due diligence",
};

export const STATUS_FOR_RECOMMENDATION: Record<Memo["recommendation"], DealStatus> = {
  REJECT: "REJECTED",
  PENDING_INFO: "PENDING_INFO",
  ADVANCE_TO_DILIGENCE: "DILIGENCE",
};

/** Thrown at the next checkpoint once someone presses Stop. */
class AnalysisStopped extends Error {}

async function ensureNotStopped(id: string) {
  const a = await db.analysis.findUnique({ where: { id }, select: { status: true } });
  if (!a || a.status === "STOPPED") throw new AnalysisStopped();
}

async function setProgress(id: string, progress: string) {
  await ensureNotStopped(id);
  await db.analysis.update({ where: { id }, data: { progress } });
}

export type StepKind = "start" | "info" | "done" | "warn";
export type Step = { at: string; text: string; kind: StepKind };

/**
 * Appends one line to the analysis's live log. Atomic in SQL so the parallel
 * research passes can report as they finish without overwriting each other.
 */
async function logStep(id: string, text: string, kind: StepKind = "info") {
  const entry = JSON.stringify([{ at: new Date().toISOString(), text: plainPunctuation(text), kind }]);
  await db
    .$executeRaw`UPDATE "Analysis" SET "steps" = COALESCE("steps", '[]'::jsonb) || ${entry}::jsonb WHERE "id" = ${id} AND "status" <> 'STOPPED'`
    .catch((err) => console.error("[analyst] could not record step", err));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listNames = (names: string[], max = 4) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} and ${names.length - max} more`;

/** A deal still carries a placeholder name when nobody typed one at upload. */
export function hasPlaceholderName(deal: { autoNamed: boolean; companyName: string }) {
  return deal.autoNamed || deal.companyName.startsWith("Untitled");
}

/** Deal documents in priority order: newest round first, pitch deck first within a round. */
function dealFiles(docs: Document[]): InputFile[] {
  return [...docs]
    .sort((a, b) => b.round - a.round || Number(b.kind === "PITCH_DECK") - Number(a.kind === "PITCH_DECK") || b.createdAt.getTime() - a.createdAt.getTime())
    .map((doc) => ({
      ...doc,
      context: `Submitted in round ${doc.round}${doc.round === 1 ? " (original pitch)" : " (follow-up information)"}; category: ${doc.kind.replaceAll("_", " ").toLowerCase()}.`,
    }));
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
    void recordCreditOk().catch(() => {});
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

/** Science, regulatory precedent, licensing comps and contradictions. */
function researchBrief(companyName: string, docs: ContentBlock[]) {
  return webResearch(`Company under review: ${companyName}.\n\n${RESEARCH_PROMPT}`, docs, { search: 12, fetch: 8 });
}

/** Dedicated diligence passes: founders and management, IP, market. */
function diligenceResearch(prompt: string, companyName: string, docs: ContentBlock[]) {
  return webResearch(`Company under review: ${companyName}.\n\n${prompt}`, docs, { search: 15, fetch: 10 });
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
    areas: f.areas.map((a) => FEEDBACK_AREA_LABEL[a] ?? a),
    lesson: f.lesson,
    appliesTo: f.appliesTo,
  }));
  return firmContextBlock({ settings, principles, calibration, portfolio, pipeline });
}

export function systemBlocks(firmContext: string): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    { type: "text", text: `${ANALYST_PROFILE}\n\n${METHODOLOGY}`, cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: firmContext, cache_control: { type: "ephemeral" } },
  ];
}

type PriorWithFeedback = Analysis & { feedback?: { verdict: string; comment: string; areas: string[]; lesson: string | null; correctedRecommendation: string | null }[] };

function priorAnalysesBlock(prior: PriorWithFeedback[]): string | null {
  const complete = prior.filter((a) => a.status === "COMPLETE" && a.memo);
  if (!complete.length) return null;
  const latest = complete[complete.length - 1];
  const history = complete
    .map((a) => `- v${a.version} (${a.completedAt?.toISOString().slice(0, 10)}): ${a.recommendation}, score ${a.overallScore}${a.analystContext ? `; team note: "${a.analystContext}"` : ""}`)
    .join("\n");
  const reviews = complete.flatMap((a) =>
    (a.feedback ?? []).map(
      (f) =>
        `- On v${a.version}: ${f.verdict.replaceAll("_", " ").toLowerCase()}${f.correctedRecommendation ? ` (right call: ${f.correctedRecommendation})` : ""}${f.areas.length ? `; issues: ${f.areas.map((x) => FEEDBACK_AREA_LABEL[x] ?? x).join("; ")}` : ""}. "${f.comment}"${f.lesson ? ` Lesson: ${f.lesson}` : ""}`,
    ),
  );
  return [
    "## Prior analyses of this deal",
    history,
    ...(reviews.length
      ? ["", "### The team's feedback on earlier versions of this memo", "Address every point below in this version, and say in versionDelta how each was handled.", ...reviews]
      : []),
    "",
    `### Most recent memo (v${latest.version}), in full`,
    "```json",
    JSON.stringify(latest.memo),
    "```",
  ].join("\n");
}

/** The underwriting core, shared by live analyses and backtests. */
export async function underwrite(args: {
  companyName: string;
  docs: ContentBlock[];
  firmContext: string;
  precedents: Precedents;
  research: string | null;
  competitors?: CompetitorSweep | null;
  coverage?: string;
  prior?: PriorWithFeedback[];
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
    args.coverage ?? "",
    priorBlock ? `\n${priorBlock}` : "",
    args.competitors ? `\n${competitorBlock(JSON.stringify(args.competitors))}` : "\n(No competitive sweep was available. Base market.comparableOutcomes on the materials and research brief, and flag that a full competitor sweep is outstanding.)",
    precedents ? `\n${precedents}` : "\n(No sufficiently similar precedents in Genesys' deal archive; set portfolioFit.historicalPrecedents to an empty list.)",
    args.research
      ? `\n## Independent web research (science, founders, IP and market; compiled before this memo)\n${args.research}`
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
  if (!analysis || analysis.status === "COMPLETE" || analysis.status === "STOPPED") return;
  const resumedFromPause = analysis.status === "PAUSED";
  const { deal } = analysis;

  await db.analysis.update({
    where: { id: analysisId },
    data: { status: "RUNNING", startedAt: new Date(), progress: "Reading submitted materials", error: null, steps: [] },
  });
  const resumed = analysis.status === "QUEUED" && analysis.progress?.startsWith("Restarting");
  await logStep(
    analysisId,
    resumedFromPause
      ? "Resumed after the Anthropic account was topped up; starting again from the beginning"
      : resumed
      ? "The server was updated while this was running, so the Sharminator started it again from the beginning"
      : analysis.version === 1 ? "Started the first analysis of this deal" : `Started analysis version ${analysis.version}`,
    resumed || resumedFromPause ? "warn" : "start",
  );
  let companyName = deal.companyName;

  let prepared: PreparedFiles | null = null;
  try {
    const prior = await db.analysis.findMany({
      where: { dealId: deal.id, version: { lt: analysis.version } },
      orderBy: { version: "asc" },
      include: { feedback: { select: { verdict: true, comment: true, areas: true, lesson: true, correctedRecommendation: true } } },
    });
    await setProgress(analysisId, "Reading submitted materials");
    const pages = deal.documents.reduce((n, d) => n + (d.pageCount ?? 0), 0);
    await logStep(analysisId, `Reading ${plural(deal.documents.length, "document")}${pages ? ` (${plural(pages, "page")})` : ""}: ${listNames(deal.documents.map((d) => d.filename))}`, "start");
    prepared = await prepareFiles(dealFiles(deal.documents));
    const blocks = prepared.blocks;
    if (!blocks.length) throw new Error("None of the attached documents could be read. Upload them again as PDF, Word, PowerPoint or Excel files.");
    const coverage = coverageNote(prepared);
    const readIn = deal.documents.length - prepared.omitted.length;
    await logStep(analysisId, `Read ${plural(readIn, "document")}`, "done");
    if (prepared.textOnly.length) await logStep(analysisId, `Read as text only, so charts were not seen: ${listNames(prepared.textOnly)}`, "warn");
    if (prepared.partial.length) await logStep(analysisId, `Only part of these fit in one analysis: ${listNames(prepared.partial)}`, "warn");
    if (prepared.omitted.length) await logStep(analysisId, `Too much material to read everything; skipped: ${listNames(prepared.omitted)}`, "warn");

    // Fingerprint the deal (once, or again when new materials arrive) to find precedents.
    let probe: { sector: string | null; modality: string | null; indication: string | null; tags: string[] } = deal;
    const placeholder = hasPlaceholderName(deal);
    if (!deal.tags.length || analysis.trigger !== "INITIAL_SCREEN" || placeholder) {
      await logStep(analysisId, "Identifying the company, its technology and lead indication", "start");
      const fp = await fingerprint(blocks).catch((err) => {
        if (isCreditError(err)) throw err;
        console.error("[analyst] fingerprint failed; continuing", err);
        return null;
      });
      if (fp) {
        probe = { sector: fp.sector, modality: fp.modality, indication: fp.indication, tags: fp.tags };
        const foundName = fp.companyName?.trim();
        const rename = placeholder && !!foundName;
        if (rename) companyName = foundName;
        await db.deal.update({
          where: { id: deal.id },
          data: {
            tags: fp.tags,
            indication: deal.indication ?? fp.indication,
            sector: deal.sector ?? fp.sector,
            modality: deal.modality ?? fp.modality,
            ...(rename ? { companyName, autoNamed: false } : {}),
          },
        });
        await logStep(
          analysisId,
          `Identified ${rename ? companyName : "the company"}: ${[fp.modality, fp.indication].filter(Boolean).join(" for ").toLowerCase() || fp.sector}${rename ? ". Renamed the deal to match" : ""}`,
          "done",
        );
      } else {
        await logStep(analysisId, "Couldn't classify the company automatically; continuing with the documents alone", "warn");
      }
    }
    await setProgress(analysisId, "Looking up similar past Genesys deals");
    await logStep(analysisId, "Looking for similar deals in Genesys's history", "start");
    const precedents = await findPrecedents(probe);
    await logStep(
      analysisId,
      precedents.historical.length
        ? `Found ${plural(precedents.historical.length, "similar past deal")}: ${listNames(precedents.historical.map((h) => h.companyName))}`
        : "No closely similar past Genesys deals found",
      "done",
    );
    const lessons = await db.analysisFeedback.count({ where: { lesson: { not: null } } });
    if (lessons) await logStep(analysisId, `Applying ${plural(Math.min(lessons, 40), "lesson")} from the team's feedback on earlier memos`, "info");
    const dealReviews = prior.reduce((n, a) => n + a.feedback.length, 0);
    if (dealReviews) await logStep(analysisId, `Addressing ${plural(dealReviews, "review")} of earlier versions of this memo`, "info");
    if (precedents.exemplars.length) await logStep(analysisId, `Using ${plural(precedents.exemplars.length, "example memo")} the partners approved`, "info");

    // Web research: five passes in parallel. Re-used on follow-ups unless a re-run is requested.
    const priorResearch = [...prior].reverse().find((a) => a.research);
    const priorSweep = [...prior].reverse().find((a) => a.competitors);
    let research = priorResearch?.research ?? null;
    let competitors = (priorSweep?.competitors as CompetitorSweep | undefined) ?? null;
    let competitorNotes = priorSweep?.competitorNotes ?? null;
    const refresh = analysis.trigger === "RERUN";
    if (env.webResearchEnabled && (!research || !competitors || refresh)) {
      await setProgress(analysisId, "Researching science, founders, patents, market and competitors");
      const needResearch = !research || refresh;
      const needSweep = !competitors || refresh;
      const passes = [
        needResearch && "the science and regulatory path",
        needResearch && "the founders and management team",
        needResearch && "patents and IP",
        needResearch && "the market",
        needSweep && "competitors and their funding",
      ].filter(Boolean) as string[];
      await logStep(analysisId, `Searching the web in parallel: ${passes.join(", ")}`, "start");
      // Each pass reports in the log as it finishes; a failed pass is skipped, not fatal.
      const soft = <T,>(label: string, p: Promise<T | null>, done: (v: T) => string) =>
        p.then(
          async (v) => {
            await logStep(analysisId, v ? done(v) : `Couldn't complete the ${label} research; continuing without it`, v ? "done" : "warn");
            return v;
          },
          async (err) => {
            // Out of credit: stop the whole analysis rather than carry on without research.
            if (isCreditError(err)) throw err;
            console.error(`[analyst] ${label} research failed; continuing without it`, err);
            await logStep(analysisId, `Couldn't complete the ${label} research; continuing without it`, "warn");
            return null;
          },
        );
      const sourcesIn = (t: string) => new Set(t.match(URL_RE) ?? []).size;
      const finished = (what: string) => (t: string) => `Finished ${what}${sourcesIn(t) ? ` (${plural(sourcesIn(t), "source")})` : ""}`;
      const [science, founders, ip, market, swept] = await Promise.all([
        needResearch ? soft("science", researchBrief(companyName, blocks), finished("the science and regulatory research")) : null,
        needResearch ? soft("founder", diligenceResearch(FOUNDER_RESEARCH_PROMPT, companyName, blocks), finished("the founder and management research")) : null,
        needResearch ? soft("patent", diligenceResearch(IP_RESEARCH_PROMPT, companyName, blocks), finished("the patent and IP research")) : null,
        needResearch ? soft("market", diligenceResearch(MARKET_RESEARCH_PROMPT, companyName, blocks), finished("the market research")) : null,
        needSweep
          ? soft("competitor", competitorSweep(companyName, blocks), (r) => {
              const names = r.sweep.competitors.map((c) => c.name);
              return names.length ? `Found ${plural(names.length, "competitor")}: ${listNames(names, 5)}` : "Competitor search finished; no direct competitors could be confirmed";
            })
          : null,
      ]);
      if (needResearch) {
        const sections = [
          ["Science and regulatory brief", science],
          ["Founders and management research", founders],
          ["Intellectual property research", ip],
          ["Market and epidemiology research", market],
        ].filter(([, v]) => v) as [string, string][];
        research = sections.length ? sections.map(([h, v]) => `## ${h}\n\n${v}`).join("\n\n") : null;
      }
      if (swept) {
        competitors = swept.sweep;
        competitorNotes = swept.notes;
      }
    }
    else if (research || competitors) {
      await logStep(analysisId, "Re-using the web research from the previous version", "info");
    }
    // Everything retrieved from the web is a citable source for the fact-check.
    const webSources = [research, competitorNotes].filter(Boolean).join("\n\n") || null;

    await setProgress(analysisId, prior.length ? "Writing the memo with the new information" : "Writing the memo");
    const firmContext = await buildFirmContext({ excludeDealId: deal.id });
    const underwriteArgs = {
      companyName,
      docs: blocks,
      coverage,
      prior,
      research,
      competitors,
      precedents,
      firmContext,
      analystContext: analysis.analystContext,
    };
    await logStep(analysisId, prior.length ? "Writing the updated memo with the new information" : "Writing the memo: science, team, IP, market, financials and fit with Genesys", "start");
    const draft = await underwrite(underwriteArgs);
    await logStep(analysisId, `Draft memo written: ${RECOMMENDATION_TEXT[draft.memo.recommendation]}, score ${draft.memo.overallScore}/100`, "done");
    let memo = draft.memo;
    const usage = { ...draft.usage };
    const model = draft.model;

    // ── Verification: deterministic checks + independent fact-check, one revision if needed.
    await setProgress(analysisId, "Fact-checking every claim against the sources");
    await logStep(analysisId, `Fact-checking ${plural(memo.evidence?.length ?? 0, "claim")} against the documents and research`, "start");
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
        if (isCreditError(err)) throw err;
        console.error("[analyst] fact-check failed", err);
        return null;
      });
      return { memo: auto.sanitized, report: summarise(auto, fact, auto.sanitized, revisions) };
    };
    let checked = await check(memo, 0);
    const serious = checked.report.issues.filter((i) => i.severity !== "LOW");
    const removed = checked.report.issues.filter((i) => i.correction === "remove").length;
    await logStep(
      analysisId,
      checked.report.issues.length
        ? `Fact-check found ${plural(checked.report.issues.length, "point")} to fix${serious.length ? ` (${serious.length} serious)` : ""}${removed ? `; removed ${plural(removed, "unsourced item")}` : ""}`
        : "Fact-check passed: every claim traced to a source",
      checked.report.issues.length ? "warn" : "done",
    );
    if (checked.report.status === "FAILED" && serious.length) {
      await setProgress(analysisId, "Fixing the points the fact-check found");
      await logStep(analysisId, "Rewriting the memo to fix the serious points", "start");
      const revised = await underwrite({ ...underwriteArgs, corrections: correctionsBlock(serious) });
      usage.input_tokens += revised.usage.input_tokens;
      usage.output_tokens += revised.usage.output_tokens;
      await setProgress(analysisId, "Re-checking the corrected memo");
      checked = await check(revised.memo, 1);
      await logStep(
        analysisId,
        checked.report.status === "FAILED" ? "Some serious points remain after the correction; they are listed on the memo for review" : "Corrections made and re-checked",
        checked.report.status === "FAILED" ? "warn" : "done",
      );
    }
    memo = checked.memo;
    const report = checked.report;

    await ensureNotStopped(analysisId);
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
          // The name the materials give wins over a placeholder taken from the uploaded file name.
          companyName: companyName === deal.companyName && hasPlaceholderName(deal) ? memo.company.name?.trim() || companyName : companyName,
          autoNamed: false,
        },
      }),
      db.activity.create({
        data: {
          dealId: deal.id,
          type: "analysis.complete",
          message: `The Sharminator finished version ${analysis.version}: it ${RECOMMENDATION_TEXT[memo.recommendation]} (score ${memo.overallScore}/100). ${report.status === "PASSED" ? "The fact-check passed." : "The fact-check left points to review."} Waiting for someone to review and sign off.`,
        },
      }),
    ]);
    await logStep(analysisId, `Finished: ${RECOMMENDATION_TEXT[memo.recommendation]}. The memo is ready for review and sign-off`, "done");
  } catch (err) {
    // Someone pressed Stop: the stop action already recorded it, so just wind down.
    if (err instanceof AnalysisStopped) return;
    if (isCreditError(err)) {
      await recordCreditProblem().catch(() => {});
      await db.analysis.update({
        where: { id: analysisId },
        data: { status: "PAUSED", progress: null, error: "Paused because the Anthropic account behind the Sharminator has run out of credit." },
      });
      await logStep(analysisId, "Paused: the Anthropic account has run out of credit. Once credit is added, press Resume (or an administrator can check credit on the Administration page, which resumes paused analyses)", "warn");
      await db.activity.create({
        data: { dealId: deal.id, type: "analysis.paused", message: `The Sharminator paused version ${analysis.version}: the Anthropic account is out of credit.` },
      });
      return;
    }
    const message = describeError(err);
    console.error("[analyst] analysis failed", analysisId, err);
    await logStep(analysisId, `Stopped: ${message}`, "warn");
    await db.analysis.update({
      where: { id: analysisId },
      data: { status: "FAILED", progress: null, error: message.slice(0, 2000), completedAt: new Date() },
    });
    await db.activity.create({
      data: { dealId: deal.id, type: "analysis.failed", message: `The Sharminator could not finish version ${analysis.version}: ${message.slice(0, 300)}` },
    });
  } finally {
    // Remove any large files uploaded to the model provider for this analysis.
    await prepared?.cleanup();
  }
}

export function describeError(err: unknown): string {
  return err instanceof Anthropic.APIError
    ? friendlyApiError(err.status, err)
    : err instanceof Error
      ? err.message
      : String(err);
}

function friendlyApiError(status: number | undefined, err?: unknown): string {
  if (isCreditError(err)) return "The Anthropic account behind the Sharminator has run out of credit. Add credit, then try again.";
  if (status === 401 || status === 403) return "The Sharminator's AI service key was rejected. Ask your developer to check the Anthropic API key.";
  if (status === 429) return "The AI service is busy or the account's usage limit was reached. Try again in a few minutes.";
  if (status === 400 || status === 413) return "The AI service couldn't accept these files. Try again; if it repeats, upload fewer or smaller files.";
  if (status && status >= 500) return "The AI service had a temporary problem. Try again in a few minutes.";
  return "The Sharminator couldn't reach the AI service. Check the connection and try again.";
}

/**
 * Called when the server starts. A deploy or restart kills any analysis that was
 * running, so recent ones are started again automatically; very old ones are
 * marked as not finished so they can be re-run by hand.
 */
export async function recoverStaleAnalyses() {
  const cutoff = new Date(Date.now() - 45 * 60 * 1000);
  const resumeCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
  await db.analysis.updateMany({
    where: { status: { in: ["RUNNING", "QUEUED"] }, createdAt: { lt: resumeCutoff } },
    data: { status: "FAILED", error: "The server restarted while this was running. Run the analysis again.", progress: null },
  });
  const interrupted = await db.analysis.findMany({ where: { status: { in: ["RUNNING", "QUEUED"] } }, select: { id: true } });
  for (const { id } of interrupted) {
    await db.analysis.update({ where: { id }, data: { status: "QUEUED", progress: "Restarting after a server update" } });
    // Not awaited: startup must not wait for analyses that take many minutes.
    void runAnalysis(id).catch((err) => console.error("[startup] could not resume analysis", id, err));
  }
  if (interrupted.length) console.log(`[startup] resumed ${interrupted.length} interrupted analys${interrupted.length === 1 ? "is" : "es"}`);
  await db.backtestRun.updateMany({
    where: { status: { in: ["RUNNING", "QUEUED"] }, createdAt: { lt: cutoff } },
    data: { status: "FAILED", error: "Interrupted by a server restart." },
  });
  await db.historicalDeal.updateMany({
    where: { ingestStatus: "PROCESSING", updatedAt: { lt: cutoff } },
    data: { ingestStatus: "FAILED", ingestError: "Interrupted by a server restart. Retry ingestion." },
  });
}

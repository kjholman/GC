import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Analysis, DealStatus, Document, PortfolioCompany, Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { FIRM_SETTINGS, getFirmSettings } from "../training/settings";
import { findPrecedents } from "../training/retrieval";
import { coverageNote, prepareFiles, type InputFile, type PreparedFiles } from "./files";
import { FALLBACK_BETA, anthropic, structuredCall, textOf, type ContentBlock } from "./client";
import { plainPunctuation } from "./style";
import { isCreditError, recordCreditOk, recordCreditProblem } from "./credit";
import { meteredUsd, recordUsage, withMeter } from "./usage";
import { findPortfolioMatch } from "../deals/portfolio";
import { cleanDomain, inspectLogo, logoFromWebsite, websiteFromText } from "../deals/logo";
import { refreshSlug } from "../deals/slug";
import { sendAnalysisProblem, sendAnalysisReady } from "../mailer";
import { FEEDBACK_AREA_LABEL } from "../feedback/options";
import { automatedChecks, correctionsBlock, modelFactCheck, sourceTexts, summarise, type VerificationReport } from "./verify";
import { CompetitorSweepSchema, FingerprintSchema, MemoSchema, normaliseMemo, type CompetitorSweep, type Fingerprint, type Memo } from "./schema";

import {
  ANALYST_PROFILE,
  COMPETITOR_EXTRACT_PROMPT,
  COMPETITOR_SWEEP_PROMPT,
  FOUNDER_RESEARCH_PROMPT,
  IP_RESEARCH_PROMPT,
  MARKET_RESEARCH_PROMPT,
  COMPANY_RESEARCH_PROMPT,
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

const REC_LABEL: Record<Memo["recommendation"], string> = { REJECT: "Decline", PENDING_INFO: "Request information", ADVANCE_TO_DILIGENCE: "Advance to diligence" };
const stripTags = (s: string) => s.replace(/\s?\[E\d+\]/g, "");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, s.lastIndexOf(" ", n))}…` : s);

/** Emails the person who started an analysis. Never fails the analysis. */
async function notifyStarter(userId: string | null, send: (to: string, firstName: string) => Promise<void>) {
  if (!userId) return;
  try {
    const u = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, active: true } });
    if (!u?.active) return;
    const raw = u.name?.trim().split(/\s+/)[0] || u.email.split("@")[0].split(/[._-]/)[0];
    await send(u.email, raw.charAt(0).toUpperCase() + raw.slice(1));
  } catch (err) {
    console.error("[analyst] could not send notification email", err);
  }
}

const PASS_LABEL: Record<Pass, string> = { science: "science and regulatory", founders: "founder and management", ip: "patent and IP", market: "market", company: "company track record" };
/** The web research passes every analysis runs (plus the competitor sweep). */
const PASSES = ["science", "founders", "ip", "market", "company"] as const;

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

/** The four stages shown on the progress card, set explicitly so a reworded status line can't mislabel them. */
type Stage = "reading" | "researching" | "writing" | "checking";

async function setProgress(id: string, progress: string, stage: Stage) {
  await ensureNotStopped(id);
  await db.analysis.update({ where: { id }, data: { progress, stage } });
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

/** "42s", "3m 05s", "1h 02m". */
export function fmtElapsed(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${String(sec % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Records how long one stage took, for the per-version time breakdown. */
async function saveTiming(id: string, stage: string, ms: number) {
  const entry = JSON.stringify([{ stage, ms: Math.round(ms) }]);
  await db.$executeRaw`UPDATE "Analysis" SET "timings" = COALESCE("timings", '[]'::jsonb) || ${entry}::jsonb WHERE "id" = ${id}`.catch(
    (err) => console.error("[analyst] could not record timing", err),
  );
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
    tier: "fast",
    step: "reading the materials",
    effort: "low",
    maxTokens: 8000,
    content: [...docs, { type: "text", text: FINGERPRINT_PROMPT }],
  });
  return { ...data, tags: data.tags.map((t) => t.toLowerCase().trim()).filter(Boolean).slice(0, 15) };
}

/** Agentic web research with server-side search/fetch; returns sourced notes. */
export async function webResearch(step: string, prompt: string, input: ContentBlock[], limits: { search: number; fetch: number }): Promise<string | null> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: [...input, { type: "text", text: prompt }] }];
  for (let turn = 0; turn < 6; turn++) {
    const stream = anthropic().beta.messages.stream({
      // Research is gathering and summarising, so it runs on the cheaper model.
      model: env.anthropicFastModel,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: limits.search },
        // Cap each fetched page: long pages are the biggest hidden cost in research.
        ...(limits.fetch > 0 ? [{ type: "web_fetch_20260209" as const, name: "web_fetch" as const, max_uses: limits.fetch, max_content_tokens: 8000 }] : []),
      ],
      messages,
    });
    const response = await stream.finalMessage();
    recordUsage(response.model, response.usage, step);
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

/**
 * Finds the company's official website with a short web search (a few cents),
 * for decks that don't give one. Returns a bare domain or null.
 */
export async function findCompanyWebsite(companyName: string, about: string | null): Promise<string | null> {
  const text = await webResearch(
    "finding the website",
    `What is the official website of the company "${companyName}"${about ? ` (${about.slice(0, 300)})` : ""}? Search once or twice, then reply with only its domain, such as example.com, and nothing else. If you can't find it with confidence, reply with NONE.`,
    [],
    { search: 3, fetch: 0 },
  ).catch(() => null);
  if (!text || /\bNONE\b/.test(text)) return null;
  for (const w of text.split(/\s+/)) {
    const d = cleanDomain(w);
    if (d) return d;
  }
  return null;
}

/**
 * Finds the company's logo, trying in order: the website already known, the website
 * named in the materials (email addresses and links), the official site found by a
 * web search. The logo itself always comes from online (the company's site or a
 * logo service), never from the deck. Records what it tried on the deal so the page
 * can say why nothing was found. Never throws.
 */
export async function findDealLogo(dealId: string, opts: { force?: boolean; analysisId?: string } = {}): Promise<boolean> {
  try {
    const d = await db.deal.findUnique({
      where: { id: dealId },
      select: { website: true, logoMime: true, logoCheckedAt: true, companyName: true, oneLiner: true, autoNamed: true, researchDossier: true },
    });
    if (!d || d.logoMime) return !!d?.logoMime;
    // Automatic retries at most hourly; the "Find logo" button and analyses always try.
    if (!opts.force && d.logoCheckedAt && Date.now() - d.logoCheckedAt.getTime() < 3600 * 1000) return false;
    await db.deal.update({ where: { id: dealId }, data: { logoCheckedAt: new Date() } });
    const notes: string[] = [];
    const log = (t: string) => (opts.analysisId ? logStep(opts.analysisId, t, "info") : Promise.resolve());
    const tried = new Set<string>();
    const tryWebsite = async (site: string, how: string) => {
      const domain = cleanDomain(site);
      if (!domain || tried.has(domain)) return false;
      tried.add(domain);
      // The website is only saved when it actually yields the logo.
      const r = await logoFromWebsite(dealId, domain);
      if (r === true) {
        await log(`Found the company logo on ${domain} (${how})`);
        return true;
      }
      notes.push(`${how}: ${r}`);
      return false;
    };
    const placeholder = d.autoNamed || d.companyName.startsWith("Untitled");
    const name = placeholder ? "" : d.companyName;

    if (d.website && (await tryWebsite(d.website, "website on file"))) return true;

    const docs = await db.document.findMany({ where: { dealId }, select: { extractedText: true, plainText: true }, orderBy: [{ round: "asc" }, { createdAt: "asc" }] });
    const deckText = docs.map((x) => x.plainText ?? x.extractedText ?? "").join("\n");
    const fromDeck = websiteFromText(deckText, name || d.companyName.replace(/^Untitled:\s*/, "").split(/[_\s-]/)[0]);
    if (fromDeck) {
      if (await tryWebsite(fromDeck, "website named in the materials")) return true;
    } else notes.push("no website address found in the materials");

    if (name) {
      const site = await withMeter({ purpose: opts.analysisId ? "analysis" : "logo lookup", analysisId: opts.analysisId }, () =>
        findCompanyWebsite(name, d.researchDossier?.slice(0, 400) ?? d.oneLiner),
      );
      if (site) {
        if (await tryWebsite(site, "website found online")) return true;
      } else notes.push("a web search found no confident match for the official site");
    }

    // Keep a website found in the materials even without a logo: it is useful in its own right.
    if (!d.website && fromDeck) await db.deal.update({ where: { id: dealId }, data: { website: `https://${cleanDomain(fromDeck)}` } });
    await db.deal.update({ where: { id: dealId }, data: { logoNote: notes.join("; ").slice(0, 800) || "nothing to try yet" } });
    return false;
  } catch (err) {
    console.error("[analyst] logo lookup failed", dealId, err);
    return false;
  }
}

/**
 * On opening a deal: logos saved before they were checked are checked once (a blank
 * one is replaced, a white one goes on a dark tile); deals without a logo get an
 * automatic, at-most-hourly lookup.
 */
export async function ensureDealLogo(dealId: string): Promise<void> {
  const d = await db.deal.findUnique({ where: { id: dealId }, select: { logo: true, logoMime: true, logoOnDark: true, logoNote: true } });
  // Logos once lifted from a deck are replaced with the company's logo from online.
  if (d?.logoMime && d.logoNote?.startsWith("Taken from the title slide")) {
    await db.deal.update({ where: { id: dealId }, data: { logo: null, logoMime: null, logoOnDark: null, logoNote: null } });
    await findDealLogo(dealId, { force: true });
    return;
  }
  if (d?.logo && d.logoMime && d.logoOnDark === null) {
    const img = await inspectLogo(Buffer.from(d.logo), d.logoMime);
    if (img.blank) {
      await db.deal.update({ where: { id: dealId }, data: { logo: null, logoMime: null, logoOnDark: null } });
      await findDealLogo(dealId, { force: true });
    } else {
      await db.deal.update({ where: { id: dealId }, data: { logo: new Uint8Array(img.buf), logoMime: img.mime, logoOnDark: img.light, logoCheckedAt: new Date() } });
    }
    return;
  }
  await findDealLogo(dealId);
}

/** Science, regulatory precedent, licensing comps and contradictions. */
function researchBrief(companyName: string, input: ContentBlock[]) {
  return webResearch("research: science", `Company under review: ${companyName}.\n\n${RESEARCH_PROMPT}`, input, { search: 8, fetch: 5 });
}

/** Dedicated diligence passes: founders and management, IP, market. */
function diligenceResearch(step: string, prompt: string, companyName: string, input: ContentBlock[]) {
  return webResearch(step, `Company under review: ${companyName}.\n\n${prompt}`, input, { search: 8, fetch: 5 });
}

/**
 * What the research passes see instead of the full deck: the dossier extracted
 * once from the materials. Sending the deck to five parallel passes was the
 * single largest cost of an analysis.
 */
function researchInput(dossier: string | null | undefined, docs: ContentBlock[]): ContentBlock[] {
  return dossier
    ? [{ type: "text", text: `## Company dossier (extracted from the submitted materials)\n${dossier}` }]
    : docs;
}

const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;
const cleanUrl = (u: string) => u.replace(/[.,;]+$/, "");

/**
 * Stage 2: competitive sweep. A search pass dedicated to companies doing the same
 * thing (funding rounds, investors, outcomes), then a strict extraction into a
 * table. Entries whose sources do not appear in the research notes are dropped.
 */
export async function competitorSweep(companyName: string, docs: ContentBlock[]): Promise<{ notes: string; sweep: CompetitorSweep } | null> {
  const notes = await webResearch("research: competitors", `Company under review: ${companyName}.\n\n${COMPETITOR_SWEEP_PROMPT}`, docs, { search: 15, fetch: 8 });
  if (!notes) return null;
  const { data } = await structuredCall({
    schema: CompetitorSweepSchema,
    tier: "fast",
    step: "competitor table",
    effort: "low",
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
  const [settings, principles, feedback, portfolio, pipeline, files] = await Promise.all([
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
    db.knowledgeFile.findMany({
      where: { scope: { in: ["FIRM", "PORTFOLIO"] }, status: "READY", summary: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: { scope: true, portfolioCompanyId: true, filename: true, summary: true },
    }),
  ]);
  const firmDocs = files.filter((f) => f.scope === "FIRM").slice(0, 30).map((f) => ({ filename: f.filename, summary: f.summary! }));
  const portfolioFiles: Record<string, { filename: string; summary: string }[]> = {};
  for (const f of files.filter((x) => x.scope === "PORTFOLIO" && x.portfolioCompanyId)) {
    const list = (portfolioFiles[f.portfolioCompanyId!] ??= []);
    if (list.length < 3) list.push({ filename: f.filename, summary: f.summary! });
  }
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
  // Keep the firm context to a fixed budget (about 30,000 tokens) so a growing portfolio,
  // archive of reviews or document library never crowds out the deal itself. When over,
  // trim the least decision-relevant detail first, step by step.
  const clip = (t: string | null | undefined, n: number) => (t && t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const steps = [
    () => ({ firmDocs, portfolioFiles, calibration, portfolio, pipeline }),
    () => ({ firmDocs: firmDocs.slice(0, 15).map((d) => ({ ...d, summary: clip(d.summary, 1200)! })), portfolioFiles: Object.fromEntries(Object.entries(portfolioFiles).map(([k, v]) => [k, v.slice(0, 1).map((x) => ({ ...x, summary: clip(x.summary, 600)! }))])), calibration, portfolio, pipeline: pipeline.slice(0, 25) }),
    () => ({ firmDocs: firmDocs.slice(0, 10).map((d) => ({ ...d, summary: clip(d.summary, 800)! })), portfolioFiles: {}, calibration: calibration.slice(0, 25), portfolio: portfolio.map((p) => ({ ...p, description: clip(p.description, 300)!, outcomeNotes: clip(p.outcomeNotes, 200) ?? null, lessons: clip(p.lessons, 400) ?? null })), pipeline: pipeline.slice(0, 15) }),
    () => ({ firmDocs: firmDocs.slice(0, 6).map((d) => ({ ...d, summary: clip(d.summary, 500)! })), portfolioFiles: {}, calibration: calibration.slice(0, 15), portfolio: portfolio.map((p) => ({ ...p, description: clip(p.description, 160)!, outcomeNotes: clip(p.outcomeNotes, 120) ?? null, lessons: clip(p.lessons, 240) ?? null })), pipeline: pipeline.slice(0, 10) }),
  ];
  let block = "";
  for (const step of steps) {
    block = firmContextBlock({ settings, principles, ...step() });
    if (block.length <= FIRM_CONTEXT_BUDGET) break;
  }
  return block;
}

/** Characters of firm context per analysis (roughly 30,000 tokens). */
const FIRM_CONTEXT_BUDGET = 120_000;

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
  instructions?: string | null;
  /** Set when the company is already in the Genesys portfolio. */
  portfolioContext?: string | null;
  backtest?: { year: number | null };
  corrections?: string;
  mode?: "structured" | "json";
  onSection?: (key: string) => void;
}) {
  const priorBlock = args.prior ? priorAnalysesBlock(args.prior) : null;
  const precedents = precedentsBlock(args.precedents);
  const task = [
    priorBlock
      ? `New information has been received for ${args.companyName}. Re-assess the opportunity using everything attached (documents from every round) and the prior memo below. Write a complete, updated memo, not a diff, and explain what changed in versionDelta.`
      : `Screen this opportunity (${args.companyName}) and write the investment memo. This is the first analysis of this deal, so leave versionDelta as an empty string.`,
    args.backtest ? asOfInstruction(args.backtest.year) : "",
    args.analystContext ? `\n## Note from the Genesys team\n${args.analystContext}` : "",
    args.portfolioContext ? `\n${args.portfolioContext}` : "",
    args.instructions
      ? `\n## Instructions from the Genesys team for this version\nFollow these. They say what to focus on or do differently from earlier versions. Where they conflict with a default in your guidance, the team's instruction wins, except that every claim must still be sourced and the founder email must still never mention AI or internal scores.\n${args.instructions}`
      : "",
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
    step: args.corrections ? "memo correction" : "memo",
    // The memo's format is too large for Anthropic's strict mode ("compiled grammar is too
    // large"), so it is always requested as JSON and validated and repaired on our side.
    mode: args.mode ?? "json",
    onSection: args.onSection,
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


// ─── Resilience: exact errors, automatic fallbacks, saved progress ──────────

/** Anthropic's exact words, kept for troubleshooting. */
export function errorDetail(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    const body = err.error as { error?: { type?: string; message?: string } } | undefined;
    const rid = (err as { requestID?: string | null }).requestID;
    return `${err.status ?? "network"} ${body?.error?.type ?? "error"}: ${body?.error?.message ?? err.message}${rid ? ` (request ${rid})` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** A request the API refused as malformed or too large, or an answer that didn't parse: worth retrying differently. */
function isRetryableRejection(err: unknown) {
  if (isCreditError(err)) return false;
  if (err instanceof Anthropic.APIError) return err.status === 400 || err.status === 413 || err.status === 422;
  return err instanceof SyntaxError || (err instanceof Error && /parse|ZodError|invalid_type|exceeded the maximum output/i.test(`${err.name} ${err.message}`));
}

/**
 * Tries each way of making a request in turn, moving on only when the API rejects
 * the request itself. Every fallback is written to the live log with Anthropic's reason.
 */
async function withFallbacks<T>(analysisId: string, what: string, attempts: { label: string; run: () => Promise<T> }[]): Promise<T> {
  let last: unknown;
  for (const [i, a] of attempts.entries()) {
    try {
      return await a.run();
    } catch (err) {
      last = err;
      if (!isRetryableRejection(err) || i === attempts.length - 1) break;
      console.error(`[analyst] ${what} rejected; falling back`, err);
      await logStep(analysisId, `Anthropic didn't accept the ${what} request (${errorDetail(err).slice(0, 220)}). Trying again ${attempts[i + 1].label}`, "warn");
    }
  }
  throw last;
}

/** Plain names for the memo's parts, shown in the live log as each is written. */
const MEMO_SECTION_LABEL: Record<string, string> = {
  company: "company overview",
  recommendation: "recommendation and score",
  worthOurTime: "whether it is worth our time",
  executiveSummary: "executive summary",
  investmentHighlights: "investment highlights",
  keyRisks: "key risks",
  redFlags: "red flags",
  passReasons: "reasons not to pursue",
  scorecard: "scorecard",
  science: "science",
  clinicalRegulatory: "clinical and regulatory path",
  intellectualProperty: "patents and IP",
  market: "market and competitors",
  team: "founders and team",
  financials: "financials and round",
  portfolioFit: "fit with Genesys",
  informationRequests: "questions for the founders",
  dueDiligencePlan: "diligence plan",
  founderEmail: "email to the founders",
  versionDelta: "what changed since the last version",
  analystCaveats: "caveats",
  gaps: "gaps needing manual follow-up",
  evidence: "evidence and sources for each claim",
};

type Pass = (typeof PASSES)[number];
export type Checkpoint = {
  research?: Partial<Record<Pass, string>>;
  sweep?: { notes: string; sweep: CompetitorSweep };
  draft?: { memo: Memo; model: string; docsKey: string };
  /** The fact-checked memo; final = corrections (if any) done and re-checked. */
  checked?: { memo: Memo; report: VerificationReport; docsKey: string; final: boolean };
};

/** Merges one piece of finished work into the analysis's saved progress (atomic, safe in parallel). */
async function saveCheckpoint(id: string, patch: Omit<Checkpoint, "research">, research?: Partial<Record<Pass, string>>) {
  const p = JSON.stringify(patch);
  const r = JSON.stringify(research ?? {});
  await db.$executeRaw`UPDATE "Analysis" SET "checkpoint" = COALESCE("checkpoint", '{}'::jsonb) || ${p}::jsonb || jsonb_build_object('research', COALESCE("checkpoint"->'research', '{}'::jsonb) || ${r}::jsonb) WHERE "id" = ${id}`.catch(
    (err) => console.error("[analyst] could not save progress", err),
  );
}

/** Research kept on the deal itself, so any later analysis can reuse it. */
type ResearchStore = {
  passes?: Partial<Record<Pass, { text: string; at: string }>>;
  sweep?: { notes: string; sweep: CompetitorSweep; at: string };
};

/** Merges new research into the deal's store (atomic, safe while passes finish in parallel). */
async function saveDealResearch(dealId: string, patch: ResearchStore) {
  const passes = JSON.stringify(patch.passes ?? {});
  const rest = JSON.stringify(patch.sweep ? { sweep: patch.sweep } : {});
  await db.$executeRaw`UPDATE "Deal" SET "researchStore" = COALESCE("researchStore", '{}'::jsonb) || ${rest}::jsonb || jsonb_build_object('passes', COALESCE("researchStore"->'passes', '{}'::jsonb) || ${passes}::jsonb) WHERE "id" = ${dealId}`.catch(
    (err) => console.error("[analyst] could not save research to the deal", err),
  );
}

/** Same documents and same team note: a saved draft memo still applies. */
function docsKeyFor(docIds: string[], note: string | null | undefined) {
  return `${[...docIds].sort().join(",")}|${note ?? ""}`;
}

/** The deal's documents as plain text, for when the API won't take the original files. */
function textOnlyDocs(docs: Document[]): ContentBlock[] {
  let budget = 1_600_000;
  return docs.map((d) => {
    const text = (d.extractedText ?? d.plainText ?? "(no text could be extracted from this file)").slice(0, Math.max(2000, budget));
    budget -= text.length;
    return { type: "document", source: { type: "text", media_type: "text/plain", data: text }, title: d.filename, context: `Round ${d.round}; text only.` } as ContentBlock;
  });
}

/** Runs one live analysis end-to-end, metering every AI call. Safe to call from a background task. */
export function runAnalysis(analysisId: string): Promise<void> {
  return withMeter({ purpose: "analysis", analysisId }, async () => {
    try {
      await runAnalysisSteps(analysisId);
    } finally {
      const usd = meteredUsd();
      if (usd > 0) {
        const a = await db.analysis.findUnique({ where: { id: analysisId }, select: { costUsd: true, status: true } });
        // A resumed analysis adds to what earlier attempts already spent.
        await db.analysis.update({ where: { id: analysisId }, data: { costUsd: (a?.costUsd ?? 0) + usd } }).catch(() => {});
        if (a?.status === "COMPLETE") await logStep(analysisId, `AI credits used for this run: about US$${usd.toFixed(2)}`, "info");
      }
    }
  });
}

async function runAnalysisSteps(analysisId: string): Promise<void> {
  const analysis = await db.analysis.findUnique({
    where: { id: analysisId },
    include: { deal: { include: { documents: true } } },
  });
  if (!analysis || analysis.status === "COMPLETE" || analysis.status === "STOPPED") return;
  const { deal } = analysis;
  // A run that already did some work (paused for credit, interrupted by a server update):
  // its log is kept and everything it finished is reused, so it carries on rather than restarts.
  const done = (analysis.checkpoint ?? {}) as Checkpoint;
  const carriedOver = [
    ...[...PASSES].filter((k) => done.research?.[k]).map((k) => PASS_LABEL[k] + " research"),
    ...(done.sweep ? ["competitor sweep"] : []),
    ...(done.draft ? ["draft memo"] : []),
    ...(done.checked ? [done.checked.final ? "fact-checked memo" : "fact-check"] : []),
  ];
  const continuing = Array.isArray(analysis.steps) && analysis.steps.length > 0;
  const why =
    analysis.status === "PAUSED" || analysis.progress === "Resuming"
      ? "Resumed after the Anthropic account was topped up"
      : analysis.progress?.startsWith("Restarting")
        ? "Picked up again after a server update"
        : "Started again";

  await db.analysis.update({
    where: { id: analysisId },
    data: { status: "RUNNING", startedAt: new Date(), progress: "Reading submitted materials", stage: "reading", error: null },
  });
  await logStep(
    analysisId,
    continuing
      ? `${why}. Carrying on where it left off${carriedOver.length ? `; already done and reused: ${carriedOver.join(", ")}` : ""}`
      : analysis.version === 1 ? "Started the first analysis of this deal" : `Started analysis version ${analysis.version}`,
    continuing ? "info" : "start",
  );
  let companyName = deal.companyName;

  let prepared: PreparedFiles | null = null;
  try {
    const prior = await db.analysis.findMany({
      where: { dealId: deal.id, version: { lt: analysis.version } },
      orderBy: { version: "asc" },
      include: { feedback: { select: { verdict: true, comment: true, areas: true, lesson: true, correctedRecommendation: true } } },
    });
    await setProgress(analysisId, "Reading submitted materials", "reading");
    const pages = deal.documents.reduce((n, d) => n + (d.pageCount ?? 0), 0);
    const tRead = Date.now();
    await logStep(analysisId, `Reading ${plural(deal.documents.length, "document")}${pages ? ` (${plural(pages, "page")})` : ""}: ${listNames(deal.documents.map((d) => d.filename))}`, "start");
    prepared = await prepareFiles(dealFiles(deal.documents));
    const blocks = prepared.blocks;
    if (!blocks.length) throw new Error("None of the attached documents could be read. Upload them again as PDF, Word, PowerPoint or Excel files.");
    const coverage = coverageNote(prepared);
    const readIn = deal.documents.length - prepared.omitted.length;
    await logStep(analysisId, `Read ${plural(readIn, "document")} (${fmtElapsed(Date.now() - tRead)})`, "done");
    await saveTiming(analysisId, "Reading the materials", Date.now() - tRead);
    if (prepared.textOnly.length) await logStep(analysisId, `Read as text only, so charts were not seen: ${listNames(prepared.textOnly)}`, "warn");
    if (prepared.partial.length) await logStep(analysisId, `Only part of these fit in one analysis: ${listNames(prepared.partial)}`, "warn");
    if (prepared.omitted.length) await logStep(analysisId, `Too much material to read everything; skipped: ${listNames(prepared.omitted)}`, "warn");

    // Fingerprint the deal (once, or again when new materials arrive) to find precedents.
    let probe: { sector: string | null; modality: string | null; indication: string | null; tags: string[] } = deal;
    const placeholder = hasPlaceholderName(deal);
    let portfolioContext: string | null = null;
    const failedResearch: string[] = [];
    let dossier: string | null = deal.researchDossier;
    // The company profile is rebuilt only when the materials changed since it was made.
    const profileKey = [...deal.documents.map((d) => d.id)].sort().join(",");
    const newestDoc = Math.max(0, ...deal.documents.map((d) => d.createdAt.getTime()));
    const profileCurrent =
      deal.dossierDocsKey != null
        ? deal.dossierDocsKey === profileKey
        : // Profiles from before this was tracked: current if a run started after the newest file.
          [...prior, analysis].some((a) => a.createdAt.getTime() >= newestDoc && a.id !== analysisId) || analysis.trigger === "INITIAL_SCREEN";
    if (!deal.tags.length || placeholder || !dossier || !profileCurrent) {
      const tId = Date.now();
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
        dossier = fp.researchDossier?.trim() || dossier;
        await db.deal.update({
          where: { id: deal.id },
          data: {
            researchDossier: dossier,
            dossierDocsKey: profileKey,
            website: deal.website ?? fp.website ?? undefined,
            tags: fp.tags,
            indication: deal.indication ?? fp.indication,
            sector: pickSector(deal.sector, fp.sector),
            modality: deal.modality ?? fp.modality,
            ...(rename ? { companyName, autoNamed: false } : {}),
          },
        });
        if (rename) await refreshSlug(deal.id);
        await logStep(
          analysisId,
          `Identified ${rename ? companyName : "the company"}: ${[fp.modality, fp.indication].filter(Boolean).join(" for ").toLowerCase() || fp.sector}${rename ? ". Renamed the deal to match" : ""} (${fmtElapsed(Date.now() - tId)})`,
          "done",
        );
        await saveTiming(analysisId, "Identifying the company", Date.now() - tId);
      } else {
        await logStep(analysisId, "Couldn't classify the company automatically; continuing with the documents alone", "warn");
      }
    } else {
      await logStep(analysisId, "Re-using the company profile built earlier (no new materials since)", "info");
      if (deal.dossierDocsKey == null) await db.deal.update({ where: { id: deal.id }, data: { dossierDocsKey: profileKey } });
    }
    // An existing Genesys investment? Then this is a follow-on decision, not a new screen.
    const latestDeal = await db.deal.findUnique({ where: { id: deal.id }, select: { companyName: true, website: true } });
    const portfolioMatch = await findPortfolioMatch({
      names: [companyName, latestDeal?.companyName],
      websites: [latestDeal?.website, websiteFromText(deal.documents.map((d) => d.plainText ?? d.extractedText ?? "").join("\n"), companyName)],
    });
    if (portfolioMatch) {
      const portfolioFiles = await db.knowledgeFile.findMany({ where: { portfolioCompanyId: portfolioMatch.id, status: "READY" }, select: { filename: true, summary: true } });
      portfolioContext = portfolioBlock(portfolioMatch, portfolioFiles);
      if (deal.portfolioCompanyId !== portfolioMatch.id) await db.deal.update({ where: { id: deal.id }, data: { portfolioCompanyId: portfolioMatch.id } });
      await logStep(
        analysisId,
        `Recognised as an existing Genesys portfolio company: ${portfolioMatch.name}${portfolioMatch.yearInvested ? ` (invested ${portfolioMatch.yearInvested})` : ""}. Assessing it as a follow-on investment, using the firm's record${portfolioFiles.length ? ` and ${plural(portfolioFiles.length, "file")} on file` : ""}`,
        "info",
      );
    } else if (deal.portfolioCompanyId) {
      await db.deal.update({ where: { id: deal.id }, data: { portfolioCompanyId: null } });
    }
    // Company logo from online: the website on file, the website named in the deck, or a web search.
    // At most hourly (opening the deal also triggers it), so resumes and re-runs don't repeat the search.
    void findDealLogo(deal.id, { analysisId });
    await setProgress(analysisId, "Looking up similar past Genesys deals", "reading");
    const tCtx = Date.now();
    await logStep(analysisId, "Looking for similar deals in Genesys's history", "start");
    const precedents = await findPrecedents(probe);
    await logStep(
      analysisId,
      precedents.historical.length
        ? `Found ${plural(precedents.historical.length, "similar past deal")}: ${listNames(precedents.historical.map((h) => h.companyName))}`
        : "No closely similar past Genesys deals found",
      "done",
    );
    // Say exactly what was consulted, and keep a record of it on this version.
    const [kbCompanies, kbPrinciples, kbDocs, kbCompanyFiles, settingsConfirmed, lessons, reviewsTotal] = await Promise.all([
      db.portfolioCompany.count(),
      db.investmentPrinciple.findMany({ where: { active: true }, select: { title: true } }),
      db.knowledgeFile.findMany({ where: { scope: "FIRM", status: "READY" }, select: { filename: true }, take: 30, orderBy: { createdAt: "desc" } }),
      db.knowledgeFile.count({ where: { scope: "PORTFOLIO", status: "READY" } }),
      db.firmSetting.count({ where: { key: { in: FIRM_SETTINGS.map((s) => s.key) } } }),
      db.analysisFeedback.count({ where: { lesson: { not: null } } }),
      db.analysisFeedback.count(),
    ]);
    const dealReviews = prior.reduce((n, a) => n + a.feedback.length, 0);
    await logStep(
      analysisId,
      `Checked the knowledge base: ${plural(kbCompanies, "portfolio company", "portfolio companies")}${kbCompanyFiles ? ` (with ${plural(kbCompanyFiles, "attached file")})` : ""}, ${plural(kbPrinciples.length, "investment principle")}, ${plural(kbDocs.length, "firm document")}, and the firm settings (${settingsConfirmed} of ${FIRM_SETTINGS.length} confirmed by a partner)`,
      "done",
    );
    await logStep(
      analysisId,
      `Checked the Training Studio: ${plural(precedents.historical.length, "similar past deal")}, ${plural(precedents.exemplars.length, "example memo")}, ${plural(Math.min(lessons, 40), "lesson")} from ${plural(reviewsTotal, "partner review")}${dealReviews ? `, and ${plural(dealReviews, "review")} of earlier versions of this deal` : ""} (${fmtElapsed(Date.now() - tCtx)})`,
      "done",
    );
    await saveTiming(analysisId, "Knowledge base and Training Studio", Date.now() - tCtx);
    await db.analysis.update({
      where: { id: analysisId },
      data: {
        contextUsed: {
          portfolioCompanies: kbCompanies,
          portfolioFiles: kbCompanyFiles,
          principles: kbPrinciples.map((p) => p.title),
          firmDocuments: kbDocs.map((d) => d.filename),
          settingsConfirmed,
          settingsTotal: FIRM_SETTINGS.length,
          pastDeals: precedents.historical.map((h) => h.companyName),
          exampleMemos: precedents.exemplars.map((e) => e.title),
          lessons: Math.min(lessons, 40),
          dealReviews,
        },
      },
    });

    // Web research: five passes in parallel. Anything already done (by this run before an
    // interruption, or by an earlier version) is reused; only missing passes run.
    const own = (analysis.checkpoint ?? {}) as Checkpoint;
    const usable = [...prior].reverse().filter((a) => !deal.freshStartAt || a.createdAt > deal.freshStartAt);
    const researchFrom = usable.find((a) => (a.checkpoint as Checkpoint | null)?.research || a.research);
    const researchAge = researchFrom ? Date.now() - (researchFrom.completedAt ?? researchFrom.createdAt).getTime() : Infinity;
    // A re-run refreshes web research only if it is more than 30 days old; follow-ups always reuse it.
    const refresh = analysis.refreshResearch || (analysis.trigger === "RERUN" && researchAge > 30 * 24 * 60 * 60 * 1000);
    // The deal keeps every piece of research ever done for it; earlier versions are the backup.
    const store = (deal.researchStore ?? {}) as ResearchStore;
    const fresh = (at?: string) => !!at && !analysis.refreshResearch && (!refresh || Date.now() - new Date(at).getTime() < 30 * 24 * 60 * 60 * 1000);
    const priorPass = (k: Pass) =>
      (fresh(store.passes?.[k]?.at) ? store.passes?.[k]?.text : undefined) ??
      (refresh ? undefined : usable.map((a) => (a.checkpoint as Checkpoint | null)?.research?.[k]).find(Boolean));
    const passes: Partial<Record<Pass, string>> = {};
    for (const k of PASSES) {
      const v = own.research?.[k] ?? priorPass(k);
      if (v) passes[k] = v;
    }
    // Versions from before progress was saved per pass kept the research as one block.
    const legacy = !refresh && !Object.keys(passes).length ? usable.find((a) => a.research)?.research ?? null : null;
    const legacySweep = refresh ? null : usable.find((a) => a.competitors);
    let sweepDone: { notes: string; sweep: CompetitorSweep } | null =
      own.sweep ??
      (store.sweep && fresh(store.sweep.at) ? { notes: store.sweep.notes, sweep: store.sweep.sweep } : null) ??
      (refresh ? null : usable.map((a) => (a.checkpoint as Checkpoint | null)?.sweep).find(Boolean)) ??
      null;
    if (!sweepDone && legacySweep?.competitors) sweepDone = { notes: legacySweep.competitorNotes ?? "", sweep: legacySweep.competitors as CompetitorSweep };

    // Research found on earlier versions but not yet on the deal is copied across, keeping its date.
    const foundAt = new Date(researchFrom?.completedAt ?? researchFrom?.createdAt ?? Date.now()).toISOString();
    const backfill = [...PASSES].filter((k) => passes[k] && !store.passes?.[k]);
    if (backfill.length || (sweepDone && !store.sweep)) {
      await saveDealResearch(deal.id, {
        passes: Object.fromEntries(backfill.map((k) => [k, { text: passes[k]!, at: foundAt }])),
        ...(sweepDone && !store.sweep ? { sweep: { ...sweepDone, at: foundAt } } : {}),
      });
    }
    const missing = legacy ? [] : [...PASSES].filter((k) => !passes[k]);
    if (legacy || missing.length < 4 || sweepDone) {
      const names = [...(legacy ? ["the earlier research"] : [...PASSES].filter((k) => passes[k]).map((k) => PASS_LABEL[k])), ...(sweepDone ? ["the competitor sweep"] : [])];
      if (names.length) await logStep(analysisId, `Re-using research already done: ${names.join(", ")}`, "info");
    }
    if (env.webResearchEnabled && (missing.length || !sweepDone)) {
      await setProgress(analysisId, "Researching science, founders, patents, market and competitors", "researching");
      const todo = [...missing.map((k) => PASS_LABEL[k]), ...(!sweepDone ? ["competitors and their funding"] : [])];
      const tRes = Date.now();
      await logStep(analysisId, `Searching the web in parallel: ${todo.join(", ")}`, "start");
      // Each pass is saved the moment it finishes, so nothing is lost if the run stops later.
      const soft = <T,>(label: string, p: Promise<T | null>, done: (v: T) => string, save: (v: T) => Promise<void>) =>
        p.then(
          async (v) => {
            const took = Date.now() - tRes;
            if (!v) failedResearch.push(label);
            else await save(v);
            const doneText = v ? done(v) : "";
            await logStep(analysisId, v ? (doneText.endsWith(")") ? `${doneText.slice(0, -1)}, ${fmtElapsed(took)})` : `${doneText} (${fmtElapsed(took)})`) : `Couldn't complete the ${label} research; continuing without it (${fmtElapsed(took)})`, v ? "done" : "warn");
            await saveTiming(analysisId, `Research: ${label === "competitor" ? "competitors" : label}`, took);
            return v;
          },
          async (err) => {
            // Out of credit: stop the whole analysis rather than carry on without research.
            if (isCreditError(err)) throw err;
            console.error(`[analyst] ${label} research failed; continuing without it`, err);
            failedResearch.push(label);
            await logStep(analysisId, `Couldn't complete the ${label} research; continuing without it (${errorDetail(err).slice(0, 160)})`, "warn");
            return null;
          },
        );
      const sourcesIn = (t: string) => new Set(t.match(URL_RE) ?? []).size;
      const finished = (what: string) => (t: string) => `Finished ${what}${sourcesIn(t) ? ` (${plural(sourcesIn(t), "source")})` : ""}`;
      const input: ContentBlock[] = [
        ...researchInput(dossier, blocks),
        ...(analysis.instructions ? [{ type: "text" as const, text: `## The Genesys team's instructions for this analysis (apply them to your research where relevant)\n${analysis.instructions}` }] : []),
      ];
      const run = (k: Pass): Promise<string | null> =>
        k === "science" ? researchBrief(companyName, input)
        : diligenceResearch(
            `research: ${k === "ip" ? "patents" : k}`,
            k === "founders" ? FOUNDER_RESEARCH_PROMPT : k === "ip" ? IP_RESEARCH_PROMPT : k === "company" ? COMPANY_RESEARCH_PROMPT : MARKET_RESEARCH_PROMPT,
            companyName,
            input,
          );
      const [, swept] = await Promise.all([
        Promise.all(
          missing.map((k) =>
            soft(k === "founders" ? "founder" : k === "ip" ? "patent" : k === "company" ? "company track record" : k, run(k), finished(`the ${PASS_LABEL[k]} research`), async (v: string) => {
              passes[k] = v;
              await saveCheckpoint(analysisId, {}, { [k]: v });
              await saveDealResearch(deal.id, { passes: { [k]: { text: v, at: new Date().toISOString() } } });
            }),
          ),
        ),
        !sweepDone
          ? soft(
              "competitor",
              competitorSweep(companyName, input),
              (r) => {
                const names = r.sweep.competitors.map((c) => c.name);
                return names.length ? `Found ${plural(names.length, "competitor")}: ${listNames(names, 5)}` : "Competitor search finished; no direct competitors could be confirmed";
              },
              async (r) => {
                await saveCheckpoint(analysisId, { sweep: r });
                await saveDealResearch(deal.id, { sweep: { ...r, at: new Date().toISOString() } });
              },
            )
          : Promise.resolve(null),
      ]);
      if (swept) sweepDone = swept;
    }
    const sections = (
      [
        ["Science and regulatory brief", passes.science],
        ["Founders and management research", passes.founders],
        ["Intellectual property research", passes.ip],
        ["Market and epidemiology research", passes.market],
        ["Company track record (independent sources, with the deck's claims checked)", passes.company],
      ] as [string, string | undefined][]
    ).filter(([, v]) => v) as [string, string][];
    const research: string | null = legacy ?? (sections.length ? sections.map(([h, v]) => `## ${h}\n\n${v}`).join("\n\n") : null);
    const competitors: CompetitorSweep | null = sweepDone?.sweep ?? null;
    const competitorNotes: string | null = sweepDone?.notes || null;
    // Keep the research on this version straight away, so a later re-run can find it.
    await db.analysis.update({
      where: { id: analysisId },
      data: { research, competitorNotes, competitors: (competitors ?? undefined) as unknown as Prisma.InputJsonValue },
    });
    // Everything retrieved from the web is a citable source for the fact-check.
    const webSources = [research, competitorNotes].filter(Boolean).join("\n\n") || null;

    await setProgress(analysisId, prior.length ? "Writing the memo with the new information" : "Writing the memo", "writing");
    const firmContext = await buildFirmContext({ excludeDealId: deal.id });
    const underwriteArgs = {
      companyName,
      docs: blocks,
      coverage,
      // After a file was removed, earlier memos (which may draw on it) are not passed on.
      prior: prior.filter((a) => !deal.freshStartAt || a.createdAt > deal.freshStartAt),
      research,
      competitors,
      precedents,
      firmContext,
      analystContext: analysis.analystContext,
      instructions: analysis.instructions,
      portfolioContext,
    };
    if (analysis.instructions) await logStep(analysisId, `Following the team's instructions: "${analysis.instructions.slice(0, 280)}${analysis.instructions.length > 280 ? "…" : ""}"`, "info");
    await logStep(analysisId, prior.length ? "Writing the updated memo with the new information" : "Writing the memo: science, team, IP, market, financials and fit with Genesys", "start");
    // A draft written before an interruption, for the same documents and note, is reused.
    const docsKey = docsKeyFor(deal.documents.map((d) => d.id), [analysis.analystContext, analysis.instructions].filter(Boolean).join("\n") || null);
    // The saved work (draft, then its fact-check) comes from one interrupted run, so they belong together.
    const draftSource = [own, ...usable.filter((a) => a.status !== "COMPLETE").map((a) => (a.checkpoint ?? {}) as Checkpoint)].find((c) => c.draft?.docsKey === docsKey);
    const savedDraft = draftSource?.draft;
    const textDocs = textOnlyDocs(deal.documents);
    // Live progress: each part of the memo is logged as it starts being written.
    const hasEarlierVersion = prior.some((a) => a.status === "COMPLETE" && (!deal.freshStartAt || a.createdAt > deal.freshStartAt));
    // Each part's time runs until the next part starts; the last part ends with the memo.
    const sectionLogger = (verb: string) => {
      let chain = Promise.resolve();
      const seen = new Set<string>();
      const start = Date.now();
      let prev: { label: string; at: number } | null = null;
      const close = (now: number) => {
        if (!prev) return;
        const p = prev;
        chain = chain.then(() => saveTiming(analysisId, `${verb === "Writing the memo" ? "Memo" : "Correction"}: ${p.label}`, now - p.at));
      };
      const on = (key: string) => {
        const label = MEMO_SECTION_LABEL[key];
        if (!label || seen.has(key) || (key === "versionDelta" && !hasEarlierVersion)) return;
        seen.add(key);
        const now = Date.now();
        close(now);
        prev = { label, at: now };
        chain = chain
          .then(() => setProgress(analysisId, `${verb}: ${label}`, verb === "Writing the memo" ? "writing" : "checking"))
          .then(() => logStep(analysisId, `${verb}: ${label} (${fmtElapsed(now - start)} in)`, "info"))
          .catch(() => {});
      };
      return Object.assign(on, { end: () => { close(Date.now()); prev = null; return chain; } });
    };
    const writeMemo = (extra: Partial<Parameters<typeof underwrite>[0]>, what: string) =>
      withFallbacks(analysisId, what, [
        { label: "as usual", run: () => underwrite({ ...underwriteArgs, ...extra }) },
        { label: "with the documents as plain text", run: () => underwrite({ ...underwriteArgs, ...extra, docs: textDocs }) },
      ]);
    const tMemo = Date.now();
    const draftSections = sectionLogger("Writing the memo");
    const draft = savedDraft
      ? { memo: savedDraft.memo, model: savedDraft.model, usage: { input_tokens: 0, output_tokens: 0 } as Anthropic.Beta.BetaUsage }
      : await writeMemo({ onSection: draftSections }, "memo-writing");
    await draftSections.end();
    if (!savedDraft) await saveTiming(analysisId, "Writing the memo", Date.now() - tMemo);
    if (savedDraft) await logStep(analysisId, "Re-using the draft memo written before the interruption", "info");
    else await saveCheckpoint(analysisId, { draft: { memo: draft.memo, model: draft.model, docsKey } });
    await logStep(analysisId, `Draft memo written: ${RECOMMENDATION_TEXT[draft.memo.recommendation]}, score ${draft.memo.overallScore}/100${savedDraft ? "" : ` (${fmtElapsed(Date.now() - tMemo)})`}`, "done");
    let memo = draft.memo;
    const usage = { ...draft.usage };
    const model = draft.model;

    // ── Verification: deterministic checks + independent fact-check, one revision if needed.
    await setProgress(analysisId, "Fact-checking every claim against the sources", "checking");
    const tFc = Date.now();
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
    // A fact-check (and correction) finished before an interruption, for the same draft, is reused.
    const savedChecked = draftSource?.checked?.docsKey === docsKey ? draftSource.checked : undefined;
    let checked: { memo: Memo; report: VerificationReport };
    if (savedChecked?.final) {
      checked = { memo: savedChecked.memo, report: savedChecked.report };
      await logStep(analysisId, "Re-using the fact-checked memo finished before the interruption", "info");
    } else {
      if (savedChecked) {
        checked = { memo: savedChecked.memo, report: savedChecked.report };
        await logStep(analysisId, "Re-using the fact-check finished before the interruption", "info");
      } else {
        checked = await check(memo, 0);
      }
      const serious = checked.report.issues.filter((i) => i.severity !== "LOW");
      const needsFix = checked.report.status === "FAILED" && serious.length > 0;
      if (!savedChecked) await saveCheckpoint(analysisId, { checked: { ...checked, docsKey, final: !needsFix } });
      const removed = checked.report.issues.filter((i) => i.correction === "remove").length;
      await logStep(
        analysisId,
        `${checked.report.issues.length
          ? `Fact-check found ${plural(checked.report.issues.length, "point")} to fix${serious.length ? ` (${serious.length} serious)` : ""}${removed ? `; removed ${plural(removed, "unsourced item")}` : ""}`
          : "Fact-check passed: every claim traced to a source"} (${fmtElapsed(Date.now() - tFc)})`,
        checked.report.issues.length ? "warn" : "done",
      );
      await saveTiming(analysisId, "Fact-checking", Date.now() - tFc);
      if (needsFix) {
        await setProgress(analysisId, "Fixing the points the fact-check found", "checking");
        const tFix = Date.now();
        await logStep(analysisId, "Rewriting the memo to fix the serious points", "start");
        const fixSections = sectionLogger("Correcting the memo");
        const revised = await writeMemo({ corrections: correctionsBlock(serious), onSection: fixSections }, "memo-correction");
        await fixSections.end();
        usage.input_tokens += revised.usage.input_tokens;
        usage.output_tokens += revised.usage.output_tokens;
        await setProgress(analysisId, "Re-checking the corrected memo", "checking");
        checked = await check(revised.memo, 1);
        await logStep(
          analysisId,
          `${checked.report.status === "FAILED" ? "Some serious points remain after the correction; they are listed on the memo for review" : "Corrections made and re-checked"} (${fmtElapsed(Date.now() - tFix)})`,
          checked.report.status === "FAILED" ? "warn" : "done",
        );
        await saveTiming(analysisId, "Correcting and re-checking", Date.now() - tFix);
        await saveCheckpoint(analysisId, { checked: { ...checked, docsKey, final: true } });
      }
    }
    memo = { ...checked.memo, meme: checked.memo.meme ?? draft.memo.meme };
    const report = checked.report;

    // Gaps the app knows about for certain, added to the ones the memo identified.
    // A memo that names nobody on the team must say so as a gap, never as a finding.
    const noTeam = !(memo.team?.members?.length);
    const teamGapListed = (memo.gaps ?? []).some((g) => /team|founder|management/i.test(`${g.area} ${g.gap}`));
    const systemGaps: Memo["gaps"] = [
      ...(noTeam && !teamGapListed
        ? [{
            area: "Team",
            gap: "The founders and management team could not be identified.",
            whyItIsAGap: "Neither the materials nor public sources named the people running the company, so the team could not be assessed. This is missing information, not evidence that there is no team.",
            howToClose: "Ask the company for the names, roles and CVs of its founders, executives and board, then re-run the analysis with that information.",
            whoCanClose: "FOUNDERS" as const,
            priority: "CRITICAL" as const,
          }]
        : []),
      ...failedResearch.map((label) => ({
        area: "Research",
        gap: `The ${label} web research could not be completed.`,
        whyItIsAGap: "The automated search failed or returned nothing usable, so this part of the memo relies on the materials alone.",
        howToClose: "Re-run the analysis, or have someone on the team check this area by hand.",
        whoCanClose: "GENESYS_TEAM" as const,
        priority: "IMPORTANT" as const,
      })),
      ...(!env.webResearchEnabled
        ? [{ area: "Research", gap: "No independent web research was done.", whyItIsAGap: "Web research is switched off for this installation.", howToClose: "Verify the company's claims, founders, patents and competitors by hand.", whoCanClose: "GENESYS_TEAM" as const, priority: "CRITICAL" as const }]
        : []),
      ...prepared.omitted.map((name) => ({
        area: "Materials", gap: `${name} was not read.`, whyItIsAGap: "The submission was too large to read in one analysis.",
        howToClose: "Review this file by hand, or re-submit it on its own as new information.", whoCanClose: "GENESYS_TEAM" as const, priority: "CRITICAL" as const,
      })),
      ...prepared.partial.map((name) => ({
        area: "Materials", gap: `Only part of ${name} was read.`, whyItIsAGap: "The file is too long to read in full alongside the others.",
        howToClose: "Review the rest by hand, or send the key sections as new information.", whoCanClose: "GENESYS_TEAM" as const, priority: "IMPORTANT" as const,
      })),
      ...prepared.textOnly.map((name) => ({
        area: "Materials", gap: `Charts and figures in ${name} were not seen.`, whyItIsAGap: "The file was read as text only because of its size or format.",
        howToClose: "Check its figures by hand, or upload the key pages as a PDF.", whoCanClose: "GENESYS_TEAM" as const, priority: "SUPPLEMENTARY" as const,
      })),
      ...report.issues
        .filter((i) => i.severity === "HIGH" && i.correction !== "remove")
        .map((i) => ({
          area: "Fact-check", gap: `Unresolved: "${i.excerpt.slice(0, 160)}"`, whyItIsAGap: i.explanation,
          howToClose: `Verify this against the source before relying on the memo. ${i.correction}`.trim(), whoCanClose: "GENESYS_TEAM" as const, priority: "CRITICAL" as const,
        })),
    ];
    memo = { ...memo, gaps: [...(memo.gaps ?? []), ...systemGaps] };

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
          analysisCount: { increment: 1 },
          keyReason: memo.recommendation === "ADVANCE_TO_DILIGENCE" ? null : (memo.passReasons?.[0]?.reason ?? (memo.recommendation === "REJECT" ? memo.worthOurTime.headline : null)),
          recommendation: memo.recommendation,
          oneLiner: deal.oneLiner ?? memo.company.oneLiner,
          sector: pickSector(deal.sector, memo.company.sector),
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
          message: `GAIA finished version ${analysis.version}: it ${RECOMMENDATION_TEXT[memo.recommendation]} (score ${memo.overallScore}/100). ${report.status === "PASSED" ? "The fact-check passed." : "The fact-check left points to review."} Waiting for someone to review and sign off.`,
        },
      }),
    ]);
    await logStep(analysisId, `Finished: ${RECOMMENDATION_TEXT[memo.recommendation]}. The memo is ready for review and sign-off`, "done");
    const slug = await refreshSlug(deal.id);
    // The finished memo may name the website: check that site (no new web search) if there is still no logo.
    void (async () => {
      const cur = await db.deal.findUnique({ where: { id: deal.id }, select: { logoMime: true, website: true } });
      if (!cur?.logoMime && cur?.website) await logoFromWebsite(deal.id);
    })().catch(() => {});
    await notifyStarter(analysis.createdById, async (to, firstName) =>
      sendAnalysisReady({
        to, firstName, companyName: (await db.deal.findUnique({ where: { id: deal.id }, select: { companyName: true } }))?.companyName ?? deal.companyName,
        version: analysis.version, url: `${env.appUrl}/deals/${slug}`,
        recommendation: REC_LABEL[memo.recommendation], score: memo.overallScore,
        headline: stripTags(memo.worthOurTime.headline),
        summary: clip(stripTags(memo.executiveSummary), 700),
        gaps: (memo.gaps ?? []).map((g) => ({ gap: g.gap, priority: g.priority })),
        factCheck: report.status === "PASSED" ? "Passed" : report.status === "WARNINGS" ? "A few points to review" : "Problems remain; check before relying on it",
      }),
    );
  } catch (err) {
    // Someone pressed Stop: the stop action already recorded it, so just wind down.
    if (err instanceof AnalysisStopped) return;
    if (isCreditError(err)) {
      await recordCreditProblem().catch(() => {});
      await db.analysis.update({
        where: { id: analysisId },
        data: { status: "PAUSED", progress: null, error: "Paused because the Anthropic account behind GAIA has run out of credit." },
      });
      await logStep(analysisId, "Paused: the Anthropic account has run out of credit. Once credit is added, press Resume (or an administrator can check credit on the Administration page, which resumes paused analyses)", "warn");
      await db.activity.create({
        data: { dealId: deal.id, type: "analysis.paused", message: `GAIA paused version ${analysis.version}: the Anthropic account is out of credit.` },
      });
      await notifyStarter(analysis.createdById, (to, firstName) =>
        sendAnalysisProblem(to, firstName, deal.companyName, `${env.appUrl}/deals/${deal.slug ?? deal.id}`,
          "It is paused because the Anthropic account behind GAIA has run out of credit. It resumes once credit is added, and nothing is lost."),
      );
      return;
    }
    const message = describeError(err);
    const detail = errorDetail(err);
    console.error("[analyst] analysis failed", analysisId, err);
    await logStep(analysisId, `Stopped: ${message} Everything finished so far is saved and will be reused when it runs again. (Anthropic said: ${detail.slice(0, 300)})`, "warn");
    await notifyStarter(analysis.createdById, (to, firstName) =>
      sendAnalysisProblem(to, firstName, deal.companyName, `${env.appUrl}/deals/${deal.slug ?? deal.id}`, `${message} You can run it again from the deal page.`),
    );
    await db.analysis.update({
      where: { id: analysisId },
      data: { status: "FAILED", progress: null, error: message.slice(0, 2000), errorDetail: detail.slice(0, 4000), completedAt: new Date() },
    });
    // A later version that fails leaves the deal at the stage its last finished analysis gave it.
    if (analysis.priorDealStatus) await db.deal.update({ where: { id: deal.id }, data: { status: analysis.priorDealStatus } }).catch(() => {});
    await db.activity.create({
      data: { dealId: deal.id, type: "analysis.failed", message: `GAIA could not finish version ${analysis.version}: ${message.slice(0, 300)}` },
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
  if (isCreditError(err)) return "The Anthropic account behind GAIA has run out of credit. Add credit, then try again.";
  if (status === 401 || status === 403) return "GAIA's AI service key was rejected. Ask your developer to check the Anthropic API key.";
  if (status === 429) return "The AI service is busy or the account's usage limit was reached. Try again in a few minutes.";
  if (status === 413) return "The request to the AI service was too large, even with the documents sent as plain text. Remove or split the largest files and try again.";
  if (status === 400 || status === 422) return "The AI service turned the request down, even after GAIA retried it in simpler forms. The exact reason is shown below; please pass it to your developer.";
  if (status && status >= 500) return "The AI service had a temporary problem. Try again in a few minutes.";
  return "GAIA couldn't reach the AI service. Check the connection and try again.";
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

/** Keep a real sector once known, but never let a placeholder like "Other" block a specific one found later. */
function pickSector(current: string | null, found: string | null | undefined): string | null {
  const vague = (v: string | null | undefined) => !v || /^(other|unknown|n\/?a|tbd|unclear)$/i.test(v.trim());
  if (!vague(current)) return current;
  return vague(found) ? (current ?? found ?? null) : found!;
}

/** What the firm already knows about a portfolio company, framed for a follow-on decision. */
function portfolioBlock(c: PortfolioCompany, files: { filename: string; summary: string | null }[]): string {
  const facts = [
    c.yearInvested ? `Invested: ${c.yearInvested}` : null,
    c.stageAtEntry ? `Stage at entry: ${c.stageAtEntry}` : null,
    c.checkSize ? `Genesys investment: ${c.checkSize}` : null,
    c.roundSize ? `Round at entry: ${c.roundSize}` : null,
    c.entryValuation ? `Valuation at entry: ${c.entryValuation}` : null,
    c.ownership ? `Ownership: ${c.ownership}` : null,
    c.coInvestors ? `Co-investors: ${c.coInvestors}` : null,
    `Status: ${c.outcome.toLowerCase().replaceAll("_", " ")}${c.outcomeNotes ? ` (${c.outcomeNotes})` : ""}`,
    c.exitValue ? `Exit or current value: ${c.exitValue}` : null,
    c.returnMultiple ? `Return so far: ${c.returnMultiple}` : null,
  ].filter(Boolean);
  return `## This is an existing Genesys portfolio company: ${c.name}
Genesys has already invested. Treat these materials as a follow-on decision (a new round, a pro-rata or a bridge), not a first screen:
- Open the executive summary by saying it is an existing portfolio company and what Genesys already holds.
- Judge progress against what was expected at the original investment: milestones hit or missed, cash used, team changes.
- Weigh the follow-on on its merits and on protecting the existing position (pro-rata rights, dilution, signalling to other investors if Genesys does not participate).
- In portfolioFit, describe the existing position; do not list ${c.name} as a comparable investment.
- Do not request information the firm already holds as an investor (board materials, prior financing documents); request only what is new.

What the firm has on record:
${facts.map((f) => `- ${f}`).join("\n")}
- Description: ${c.description}${c.lessons ? `\n- Partner notes: ${c.lessons}` : ""}${files.length ? `\n\nFrom the firm's files on ${c.name}:\n${files.map((f) => `- ${f.filename}: ${f.summary ?? "(no summary)"}`).join("\n")}` : ""}`;
}

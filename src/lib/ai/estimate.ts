import "server-only";
import { db } from "../db";
import { env } from "../env";
import { costOf } from "./usage";
import { familyOf } from "./extract";
import { CHARS_PER_TOKEN, DOC_TOKEN_BUDGET, MAX_VISUAL_PDF_PAGES, TOKENS_PER_PDF_PAGE } from "./files";

/**
 * Projected cost of an analysis, shown to the person before it runs.
 *
 * Built from what the run will actually do: the size of this deal's documents (read
 * the same way the analysis reads them), which steps can reuse earlier work (company
 * profile, web research, competitor sweep, or a paused run's finished stages), today's
 * model prices, and, once enough analyses have run, the firm's own history: average
 * output per step, the cost of research passes, how often the memo needs correcting,
 * and how far past estimates were from the actual cost.
 */

export type EstimateLine = { label: string; usd: number; note?: string };
export type CostEstimate = {
  usd: number;
  lowUsd: number;
  highUsd: number;
  lines: EstimateLine[];
  reused: string[];
  docTokens: number;
  /** "history" once enough analyses have run to calibrate on; "defaults" before that. */
  basis: "history" | "defaults";
  /** Multiplier from comparing earlier estimates with actual costs (1 when not enough data). */
  calibration: number;
};

const PASSES = ["science", "founders", "ip", "market", "company"] as const;
const PASS_LABEL: Record<(typeof PASSES)[number], string> = { science: "science", founders: "founders", ip: "patents", market: "market", company: "company" };
const DAY = 86_400_000;

// Starting points before the firm has its own history (US$ and tokens, including thinking).
const DEFAULTS = { researchPassUsd: 0.45, sweepUsd: 0.9, readingOut: 6_000, memoOut: 24_000, checkOut: 8_000, correctionRate: 0.35 };
// Prompt text sent alongside the documents: instructions, firm context, research, precedents.
const OVERHEAD = { reading: 4_000, memo: 45_000, check: 35_000, correction: 55_000 };
const MIN_SAMPLES = 5;

type DocLike = { mimeType: string; sizeBytes: number; extractedText: string | null; plainText: string | null; pageCount: number | null };

/** Tokens the documents take in one request, following the same budget the analysis uses. */
export function documentTokens(docs: DocLike[]): number {
  let tokens = 0;
  for (const d of docs) {
    const remaining = DOC_TOKEN_BUDGET - tokens;
    if (remaining < 2000) break;
    const text = (s: string) => Math.min(remaining, Math.ceil((s || " ").length / CHARS_PER_TOKEN));
    if (d.extractedText != null) { tokens += text(d.extractedText); continue; }
    const family = familyOf(d.mimeType);
    if (family === "pdf") {
      // Pages unknown (older uploads): about one page per 100 KB, at least one.
      const pages = d.pageCount ?? Math.max(1, Math.round(d.sizeBytes / 100_000));
      const visual = pages * TOKENS_PER_PDF_PAGE;
      tokens += pages <= MAX_VISUAL_PDF_PAGES && visual <= remaining ? visual : text(d.plainText ?? "");
    } else if (family === "image") tokens += Math.min(remaining, 2000);
    else tokens += text(d.plainText ?? "");
  }
  return tokens;
}

const price = (tier: "main" | "fast", input: number, output: number) =>
  costOf(tier === "main" ? env.anthropicModel : env.anthropicFastModel, { input_tokens: input, output_tokens: output } as never);

/** What the firm's recent analyses actually used, where there are enough of them. */
async function history() {
  const since = new Date(Date.now() - 120 * DAY);
  const [out, research, sweep, correction, ratios] = await Promise.all([
    db.$queryRaw<{ step: string; n: number; avg: number }[]>`
      SELECT "step", COUNT(*)::int AS n, AVG("outputTokens")::float AS avg
      FROM "AiUsage" WHERE "createdAt" >= ${since} AND "step" IN ('reading the materials', 'memo', 'fact-check')
      GROUP BY "step"`,
    db.$queryRaw<{ n: number; avg: number }[]>`
      SELECT COUNT(*)::int AS n, AVG(t.usd)::float AS avg FROM (
        SELECT SUM("usd") AS usd FROM "AiUsage"
        WHERE "createdAt" >= ${since} AND "step" LIKE 'research: %' AND "step" <> 'research: competitors' AND "analysisId" IS NOT NULL
        GROUP BY "analysisId", "step") t`,
    db.$queryRaw<{ n: number; avg: number }[]>`
      SELECT COUNT(*)::int AS n, AVG(t.usd)::float AS avg FROM (
        SELECT SUM("usd") AS usd FROM "AiUsage"
        WHERE "createdAt" >= ${since} AND "step" IN ('research: competitors', 'competitor table') AND "analysisId" IS NOT NULL
        GROUP BY "analysisId") t`,
    db.$queryRaw<{ memos: number; corrected: number }[]>`
      SELECT COUNT(DISTINCT "analysisId") FILTER (WHERE "step" = 'memo')::int AS memos,
             COUNT(DISTINCT "analysisId") FILTER (WHERE "step" = 'memo correction')::int AS corrected
      FROM "AiUsage" WHERE "createdAt" >= ${since} AND "analysisId" IS NOT NULL`,
    db.analysis.findMany({
      where: { status: "COMPLETE", estimateUsd: { gt: 0 }, costUsd: { gt: 0 }, completedAt: { gte: since } },
      select: { estimateUsd: true, costUsd: true },
      orderBy: { completedAt: "desc" },
      take: 30,
    }),
  ]);
  const outFor = (step: string, fallback: number) => {
    const r = out.find((o) => o.step === step);
    return r && r.n >= MIN_SAMPLES ? r.avg : fallback;
  };
  const r = ratios.map((x) => (x.costUsd ?? 0) / (x.estimateUsd ?? 1)).sort((a, b) => a - b);
  const calibration = r.length >= MIN_SAMPLES ? Math.min(2, Math.max(0.5, r[Math.floor(r.length / 2)])) : 1;
  const used = out.some((o) => o.n >= MIN_SAMPLES) || (research[0]?.n ?? 0) >= MIN_SAMPLES || r.length >= MIN_SAMPLES;
  return {
    readingOut: outFor("reading the materials", DEFAULTS.readingOut),
    memoOut: outFor("memo", DEFAULTS.memoOut),
    checkOut: outFor("fact-check", DEFAULTS.checkOut),
    researchPassUsd: (research[0]?.n ?? 0) >= MIN_SAMPLES ? research[0].avg : DEFAULTS.researchPassUsd,
    sweepUsd: (sweep[0]?.n ?? 0) >= MIN_SAMPLES ? sweep[0].avg : DEFAULTS.sweepUsd,
    correctionRate: (correction[0]?.memos ?? 0) >= MIN_SAMPLES ? correction[0].corrected / correction[0].memos : DEFAULTS.correctionRate,
    calibration,
    basis: used ? ("history" as const) : ("defaults" as const),
  };
}

type Checkpoint = { research?: Record<string, string>; sweep?: unknown; draft?: unknown; checked?: unknown };

/** Projected cost of running (or, for a paused run, finishing) this analysis. */
export async function estimateAnalysisCost(analysisId: string): Promise<CostEstimate> {
  const a = await db.analysis.findUniqueOrThrow({
    where: { id: analysisId },
    select: {
      trigger: true, refreshResearch: true, checkpoint: true,
      deal: {
        select: {
          dossierDocsKey: true, researchStore: true, freshStartAt: true,
          documents: { select: { id: true, mimeType: true, sizeBytes: true, extractedText: true, plainText: true, pageCount: true }, orderBy: [{ round: "asc" }, { createdAt: "asc" }] },
        },
      },
    },
  });
  const h = await history();
  const docs = documentTokens(a.deal.documents);
  const done = (a.checkpoint ?? {}) as Checkpoint;
  const lines: EstimateLine[] = [];
  const reused: string[] = [];

  // 1. Company profile and dossier: rebuilt only when the set of files changed.
  const profileKey = a.deal.documents.map((d) => d.id).sort().join(",");
  if (a.deal.dossierDocsKey === profileKey && !a.deal.freshStartAt) reused.push("company profile");
  else lines.push({ label: "Reading the materials", usd: price("fast", docs + OVERHEAD.reading, h.readingOut) });

  // 2. Web research and competitor sweep: reused while under 30 days old (a re-run with "refresh" redoes them).
  const store = (a.deal.researchStore ?? {}) as { passes?: Record<string, { at: string }>; sweep?: { at: string } };
  const fresh = (at?: string) => !!at && !a.refreshResearch && Date.now() - new Date(at).getTime() < 30 * DAY && (!a.deal.freshStartAt || new Date(at) > a.deal.freshStartAt);
  if (env.webResearchEnabled) {
    const todo = PASSES.filter((k) => !done.research?.[k] && !fresh(store.passes?.[k]?.at));
    const kept = PASSES.filter((k) => !todo.includes(k));
    if (kept.length) reused.push(`web research (${kept.map((k) => PASS_LABEL[k]).join(", ")})`);
    if (todo.length) lines.push({ label: `Web research (${todo.length} of 5 areas)`, usd: todo.length * h.researchPassUsd, note: "Includes about US$0.01 per web search" });
    if (done.sweep || fresh(store.sweep?.at)) reused.push("competitor sweep");
    else lines.push({ label: "Competitor sweep", usd: h.sweepUsd });
  }

  // 3. Memo, fact-check, and (sometimes) a corrected memo with a second check.
  if (done.draft) reused.push("draft memo");
  else lines.push({ label: "Writing the memo", usd: price("main", docs + OVERHEAD.memo, h.memoOut) });
  const correction = price("main", docs + OVERHEAD.correction, h.memoOut) + price("main", docs + OVERHEAD.check, h.checkOut);
  if (done.checked) reused.push("fact-check");
  else {
    lines.push({ label: "Fact-check", usd: price("main", docs + OVERHEAD.check, h.checkOut) });
    lines.push({
      label: "Correction and second check, if needed",
      usd: correction * h.correctionRate,
      note: `Needed for about ${Math.round(h.correctionRate * 100)}% of memos; up to US$${correction.toFixed(2)} when it is`,
    });
  }
  lines.push({ label: "Website and logo lookup, small fixes", usd: 0.05 });

  const scale = h.calibration;
  for (const l of lines) l.usd = l.usd * scale;
  const usd = lines.reduce((s, l) => s + l.usd, 0);
  const correctionLine = done.checked ? 0 : correction * h.correctionRate * scale;
  const lowUsd = Math.max(0.01, (usd - correctionLine) * 0.8);
  const highUsd = (usd - correctionLine + (done.checked ? 0 : correction * scale)) * 1.25;
  return { usd, lowUsd, highUsd, lines, reused, docTokens: docs, basis: h.basis, calibration: scale };
}

/** "US$3.20 (likely US$2.40 to US$5.10)" */
export function describeEstimate(e: Pick<CostEstimate, "usd" | "lowUsd" | "highUsd">): string {
  return `about US$${e.usd.toFixed(2)} (likely US$${e.lowUsd.toFixed(2)} to US$${e.highUsd.toFixed(2)})`;
}

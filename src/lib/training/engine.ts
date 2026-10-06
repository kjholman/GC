import "server-only";
import type { HistoricalDeal, Prisma } from "@prisma/client";
import { FEEDBACK_AREA_LABEL } from "../feedback/options";
import { db } from "../db";
import { env } from "../env";
import { buildFirmContext, describeError, fingerprint, structuredCall, underwrite, type ContentBlock } from "../ai/analyst";
import { coverageNote, prepareFiles, type PreparedFiles } from "../ai/files";
import { SuggestionsSchema } from "../ai/schema";
import { SUGGEST_PRINCIPLES_PROMPT } from "../ai/prompts";
import { findPrecedents } from "./retrieval";

// ─── Historical deal ingestion ──────────────────────────────────────────────

/** Original materials (plus the internal memo, except in backtests) as model input. */
async function historicalFiles(h: HistoricalDeal, opts: { includeMemo: boolean }): Promise<PreparedFiles> {
  const prepared = await prepareFiles(
    h.deckData && h.deckFilename && h.deckMimeType
      ? [{ filename: h.deckFilename, mimeType: h.deckMimeType, sizeBytes: h.deckData.length, data: h.deckData, extractedText: h.deckExtractedText, context: "Original materials submitted to Genesys." }]
      : [],
  );
  if (opts.includeMemo && h.icMemoText) {
    prepared.blocks.push({ type: "document", source: { type: "text", media_type: "text/plain", data: h.icMemoText }, title: "Genesys internal memo", context: "Written by the Genesys team at the time." });
  }
  return prepared;
}

/** Reads a historical deal's materials and stores its fingerprint and digest. */
export async function ingestHistoricalDeal(id: string) {
  const h = await db.historicalDeal.findUnique({ where: { id } });
  if (!h) return;
  await db.historicalDeal.update({ where: { id }, data: { ingestStatus: "PROCESSING", ingestError: null } });
  let prepared: PreparedFiles | null = null;
  try {
    prepared = await historicalFiles(h, { includeMemo: true });
    const blocks: ContentBlock[] = prepared.blocks;
    if (!blocks.length) {
      // No materials: the partner-entered fields alone are enough to retrieve on.
      blocks.push({
        type: "text",
        text: `Company: ${h.companyName}\nSector: ${h.sector ?? "?"}\nModality: ${h.modality ?? "?"}\nIndication: ${h.indication ?? "?"}\nStage: ${h.stage ?? "?"}\nGenesys rationale: ${h.decisionRationale}`,
      });
    }
    const fp = await fingerprint(blocks);
    await db.historicalDeal.update({
      where: { id },
      data: {
        ingestStatus: "READY",
        sector: h.sector ?? fp.sector,
        modality: h.modality ?? fp.modality,
        indication: h.indication ?? fp.indication,
        stage: h.stage ?? fp.stage,
        tags: fp.tags,
        digest: fp.digest,
      },
    });
  } catch (err) {
    await db.historicalDeal.update({ where: { id }, data: { ingestStatus: "FAILED", ingestError: describeError(err).slice(0, 1000) } });
  } finally {
    await prepared?.cleanup();
  }
}

// ─── Backtesting ────────────────────────────────────────────────────────────

/** What a correct screening call looks like, given what Genesys actually did. */
export function expectedFor(decision: HistoricalDeal["decision"]): "PURSUE" | "DECLINE" {
  return decision === "PASSED_AT_SCREENING" ? "DECLINE" : "PURSUE";
}

export function agrees(expected: string, ai: string) {
  return expected === "DECLINE" ? ai === "REJECT" : ai === "ADVANCE_TO_DILIGENCE" || ai === "PENDING_INFO";
}

export type BacktestMetrics = {
  scored: number;
  agreement: number;
  confusion: Record<string, Record<string, number>>;
  missedWinners: string[];
  avoidedLosses: string[];
  falseAdvances: string[];
  bias: "optimistic" | "pessimistic" | "balanced";
  bySector: { sector: string; n: number; agreement: number }[];
  meanScoreByExpected: Record<string, number>;
};

export function computeMetrics(
  rows: { expected: string; aiRecommendation: string | null; aiScore: number | null; agree: boolean | null; deal: Pick<HistoricalDeal, "companyName" | "decision" | "outcome" | "sector"> }[],
): BacktestMetrics {
  const done = rows.filter((r) => r.aiRecommendation);
  const confusion: Record<string, Record<string, number>> = {};
  for (const r of done) {
    confusion[r.deal.decision] ??= { REJECT: 0, PENDING_INFO: 0, ADVANCE_TO_DILIGENCE: 0 };
    confusion[r.deal.decision][r.aiRecommendation!]++;
  }
  const tooHigh = done.filter((r) => r.expected === "DECLINE" && r.aiRecommendation !== "REJECT").length;
  const tooLow = done.filter((r) => r.expected === "PURSUE" && r.aiRecommendation === "REJECT").length;
  const sectors = new Map<string, { n: number; ok: number }>();
  for (const r of done) {
    const s = r.deal.sector ?? "Unclassified";
    const v = sectors.get(s) ?? { n: 0, ok: 0 };
    v.n++;
    if (r.agree) v.ok++;
    sectors.set(s, v);
  }
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  return {
    scored: done.length,
    agreement: done.length ? done.filter((r) => r.agree).length / done.length : 0,
    confusion,
    missedWinners: done
      .filter((r) => r.deal.decision === "INVESTED" && ["IPO", "ACQUIRED", "MERGED"].includes(r.deal.outcome) && r.aiRecommendation === "REJECT")
      .map((r) => r.deal.companyName),
    avoidedLosses: done
      .filter((r) => r.deal.decision === "INVESTED" && r.deal.outcome === "WOUND_DOWN" && r.aiRecommendation === "REJECT")
      .map((r) => r.deal.companyName),
    falseAdvances: done.filter((r) => r.deal.decision === "PASSED_AT_SCREENING" && r.aiRecommendation === "ADVANCE_TO_DILIGENCE").map((r) => r.deal.companyName),
    bias: tooHigh > tooLow * 1.5 && tooHigh >= 2 ? "optimistic" : tooLow > tooHigh * 1.5 && tooLow >= 2 ? "pessimistic" : "balanced",
    bySector: [...sectors.entries()].map(([sector, v]) => ({ sector, n: v.n, agreement: v.ok / v.n })).sort((a, b) => b.n - a.n),
    meanScoreByExpected: {
      PURSUE: mean(done.filter((r) => r.expected === "PURSUE").map((r) => r.aiScore ?? 0)),
      DECLINE: mean(done.filter((r) => r.expected === "DECLINE").map((r) => r.aiScore ?? 0)),
    },
  };
}

/** Replays the analyst on historical deals and scores it against the firm's real decisions. */
export async function runBacktest(runId: string) {
  const run = await db.backtestRun.findUnique({ where: { id: runId } });
  if (!run || run.status === "COMPLETE") return;
  await db.backtestRun.update({ where: { id: runId }, data: { status: "RUNNING" } });
  try {
    const firmContext = await buildFirmContext();
    const pending = await db.backtestResult.findMany({
      where: { runId, aiRecommendation: null, error: null },
      include: { historicalDeal: true },
    });
    for (const result of pending) {
      const h = result.historicalDeal;
      let prepared: PreparedFiles | null = null;
      try {
        prepared = await historicalFiles(h, { includeMemo: false }); // never show the answer key
        const blocks = prepared.blocks;
        if (!blocks.length) throw new Error("No materials to replay.");
        const precedents = await findPrecedents(h, { excludeHistoricalId: h.id, beforeYear: h.decisionYear });
        const { memo } = await underwrite({
          companyName: h.companyName,
          docs: blocks,
          firmContext,
          precedents,
          research: null,
          coverage: coverageNote(prepared),
          backtest: { year: h.decisionYear },
        });
        await db.backtestResult.update({
          where: { id: result.id },
          data: {
            aiRecommendation: memo.recommendation,
            aiScore: memo.overallScore,
            agree: agrees(result.expected, memo.recommendation),
            memo: memo as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        await db.backtestResult.update({ where: { id: result.id }, data: { error: describeError(err).slice(0, 1000) } });
      } finally {
        await prepared?.cleanup();
      }
      await db.backtestRun.update({ where: { id: runId }, data: { completed: { increment: 1 } } });
    }
    const rows = await db.backtestResult.findMany({
      where: { runId },
      include: { historicalDeal: { select: { companyName: true, decision: true, outcome: true, sector: true } } },
    });
    const metrics = computeMetrics(rows.map((r) => ({ ...r, deal: r.historicalDeal })));
    await db.backtestRun.update({
      where: { id: runId },
      data: { status: "COMPLETE", completedAt: new Date(), metrics: metrics as unknown as Prisma.InputJsonValue },
    });
  } catch (err) {
    await db.backtestRun.update({ where: { id: runId }, data: { status: "FAILED", error: describeError(err).slice(0, 1000) } });
  }
}

export async function trainingSnapshot() {
  const [principles, exemplars, archive, feedback] = await Promise.all([
    db.investmentPrinciple.count({ where: { active: true } }),
    db.exemplar.count({ where: { active: true } }),
    db.historicalDeal.count({ where: { ingestStatus: "READY" } }),
    db.analysisFeedback.count(),
  ]);
  return { principles, exemplars, archive, feedback, model: env.anthropicModel, effort: env.analysisEffort };
}

// ─── Calibration → principle suggestions ────────────────────────────────────

export async function generatePrincipleSuggestions(): Promise<number> {
  const [feedback, principles] = await Promise.all([
    db.analysisFeedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 150,
      include: { analysis: { select: { recommendation: true, overallScore: true, deal: { select: { companyName: true, sector: true, modality: true } } } } },
    }),
    db.investmentPrinciple.findMany({ where: { active: true } }),
  ]);
  if (feedback.length < 3) throw new Error("At least three partner reviews are needed to look for patterns.");
  const text = [
    "## Partner critiques",
    ...feedback.map(
      (f) =>
        `- ${f.analysis.deal.companyName} (${f.analysis.deal.sector ?? "?"}; ${f.analysis.deal.modality ?? "?"}): AI said ${f.analysis.recommendation} (score ${f.analysis.overallScore}); partner verdict ${f.verdict}${f.correctedRecommendation ? ` → should be ${f.correctedRecommendation}` : ""}${f.areas.length ? `; issues: ${f.areas.map((a) => FEEDBACK_AREA_LABEL[a] ?? a).join("; ")}` : ""}. "${f.comment}"${f.lesson ? ` Lesson drawn: ${f.lesson}` : ""}`,
    ),
    "",
    "## Existing principles",
    ...(principles.length ? principles.map((p) => `- ${p.title}: ${p.body}`) : ["(none)"]),
  ].join("\n");
  const { data } = await structuredCall({
    schema: SuggestionsSchema,
    step: "principle suggestions",
    effort: "medium",
    maxTokens: 16000,
    content: [{ type: "text", text: `${SUGGEST_PRINCIPLES_PROMPT}\n\n${text}` }],
  });
  if (data.suggestions.length) {
    await db.principleSuggestion.createMany({ data: data.suggestions.slice(0, 6) });
  }
  return data.suggestions.length;
}

// ─── Dataset export (for training a proprietary model later) ────────────────

export async function* exportDataset(): AsyncGenerator<string> {
  const archive = await db.historicalDeal.findMany({ where: { ingestStatus: "READY" } });
  for (const h of archive) {
    yield JSON.stringify({
      type: "historical_decision",
      company: h.companyName,
      year: h.decisionYear,
      profile: { sector: h.sector, modality: h.modality, indication: h.indication, stage: h.stage, tags: h.tags },
      materials_digest: h.digest,
      materials_text: h.deckExtractedText,
      label: { decision: h.decision, rationale: h.decisionRationale, outcome: h.outcome, outcome_notes: h.outcomeNotes },
    }) + "\n";
  }
  const exemplars = await db.exemplar.findMany({ where: { active: true } });
  for (const e of exemplars) {
    yield JSON.stringify({ type: "endorsed_memo", title: e.title, profile: { sector: e.sector, modality: e.modality, tags: e.tags }, memo: e.memo, commentary: e.partnerCommentary }) + "\n";
  }
  const feedback = await db.analysisFeedback.findMany({
    include: { analysis: { select: { memo: true, recommendation: true, overallScore: true, deal: { select: { companyName: true, sector: true, modality: true, tags: true } } } } },
  });
  for (const f of feedback) {
    yield JSON.stringify({
      type: "partner_feedback",
      company: f.analysis.deal.companyName,
      profile: { sector: f.analysis.deal.sector, modality: f.analysis.deal.modality, tags: f.analysis.deal.tags },
      ai: { recommendation: f.analysis.recommendation, score: f.analysis.overallScore, memo: f.analysis.memo },
      label: { verdict: f.verdict, corrected_recommendation: f.correctedRecommendation, issues: f.areas, comment: f.comment, lesson: f.lesson, applies_to: f.appliesTo },
    }) + "\n";
  }
}

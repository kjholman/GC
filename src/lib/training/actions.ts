"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { HistoricalDecision, PortfolioOutcome, Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { requireRole } from "../auth/session";
import { MAX_FILE_BYTES, extractText, resolveMimeType } from "../ai/extract";
import { MemoSchema, SCORE_DIMENSIONS, normaliseMemo, type Memo } from "../ai/schema";
import { FIRM_SETTINGS } from "./settings";
import { expectedFor, generatePrincipleSuggestions, ingestHistoricalDeal, runBacktest, trainingSnapshot } from "./engine";

export type TrainState = { ok: boolean; error?: string; message?: string };

const DECISIONS: HistoricalDecision[] = ["INVESTED", "PASSED_AFTER_DILIGENCE", "PASSED_AT_SCREENING"];
const OUTCOMES: PortfolioOutcome[] = ["ACTIVE", "IPO", "ACQUIRED", "MERGED", "WOUND_DOWN", "UNKNOWN"];

function str(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function prepareDeck(file: File | null) {
  if (!file || file.size === 0) return {};
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 500 MB, the model provider's per-file maximum.`);
  const mime = resolveMimeType(file.name, file.type);
  if (!mime) throw new Error(`${file.name}: unsupported file type.`);
  const buf = Buffer.from(await file.arrayBuffer());
  return { deckFilename: file.name, deckMimeType: mime, deckData: buf, deckExtractedText: await extractText(buf, mime) };
}

function scheduleIngest(ids: string[]) {
  after(async () => {
    for (const id of ids) await ingestHistoricalDeal(id);
  });
}

// ─── Deal archive ───────────────────────────────────────────────────────────

export async function addHistoricalDealAction(_: TrainState, fd: FormData): Promise<TrainState> {
  const user = await requireRole("PARTNER");
  const companyName = str(fd, "companyName");
  const decision = str(fd, "decision") as HistoricalDecision | null;
  const rationale = str(fd, "decisionRationale");
  if (!companyName || !decision || !DECISIONS.includes(decision) || !rationale) {
    return { ok: false, error: "Company, decision and the partners' rationale are required." };
  }
  const outcome = (str(fd, "outcome") ?? "UNKNOWN") as PortfolioOutcome;
  const year = Number(str(fd, "decisionYear"));
  try {
    const deck = await prepareDeck(fd.get("deck") as File | null);
    const h = await db.historicalDeal.create({
      data: {
        companyName,
        decision,
        decisionRationale: rationale,
        decisionYear: Number.isInteger(year) && year > 1990 ? year : null,
        outcome: OUTCOMES.includes(outcome) ? outcome : "UNKNOWN",
        outcomeNotes: str(fd, "outcomeNotes"),
        sector: str(fd, "sector"),
        modality: str(fd, "modality"),
        indication: str(fd, "indication"),
        stage: str(fd, "stage"),
        icMemoText: str(fd, "icMemoText"),
        createdById: user.id,
        ...deck,
      },
    });
    await audit("training.archive_added", { userId: user.id, entity: "HistoricalDeal", entityId: h.id });
    scheduleIngest([h.id]);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath("/training/archive");
  return { ok: true, message: `${companyName} added. The analyst is reading the materials.` };
}

/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const DECISION_ALIASES: Record<string, HistoricalDecision> = {
  invested: "INVESTED", invest: "INVESTED", yes: "INVESTED",
  passed_after_diligence: "PASSED_AFTER_DILIGENCE", "passed after diligence": "PASSED_AFTER_DILIGENCE", diligence: "PASSED_AFTER_DILIGENCE",
  passed_at_screening: "PASSED_AT_SCREENING", "passed at screening": "PASSED_AT_SCREENING", passed: "PASSED_AT_SCREENING", declined: "PASSED_AT_SCREENING", no: "PASSED_AT_SCREENING",
};

export async function importArchiveCsvAction(_: TrainState, fd: FormData): Promise<TrainState> {
  const user = await requireRole("PARTNER");
  const csv = fd.get("csv");
  if (!(csv instanceof File) || csv.size === 0) return { ok: false, error: "Attach the CSV file." };
  const decks = new Map(
    fd.getAll("decks").filter((f): f is File => f instanceof File && f.size > 0).map((f) => [f.name.toLowerCase(), f]),
  );
  const rows = parseCsv(await csv.text());
  if (rows.length < 2) return { ok: false, error: "The CSV has no data rows." };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (r: string[], k: string) => {
    const i = header.indexOf(k);
    return i >= 0 ? r[i]?.trim() || null : null;
  };
  if (!header.includes("company") || !header.includes("decision")) {
    return { ok: false, error: "The CSV needs at least 'company' and 'decision' columns. Download the template." };
  }

  const created: string[] = [];
  const problems: string[] = [];
  for (const [n, r] of rows.slice(1).entries()) {
    const company = col(r, "company");
    const decision = DECISION_ALIASES[(col(r, "decision") ?? "").toLowerCase()] ?? (DECISIONS.find((d) => d === col(r, "decision")?.toUpperCase()) as HistoricalDecision | undefined);
    if (!company || !decision) {
      problems.push(`row ${n + 2}: missing company or unrecognised decision`);
      continue;
    }
    const outcomeRaw = (col(r, "outcome") ?? "UNKNOWN").toUpperCase().replace(/\s+/g, "_");
    const year = Number(col(r, "year"));
    const deckName = col(r, "deck_filename")?.toLowerCase();
    let deck = {};
    if (deckName) {
      const f = decks.get(deckName);
      if (!f) problems.push(`row ${n + 2}: deck "${deckName}" not attached`);
      else {
        try { deck = await prepareDeck(f); } catch (e) { problems.push(`row ${n + 2}: ${(e as Error).message}`); }
      }
    }
    const h = await db.historicalDeal.create({
      data: {
        companyName: company,
        decision,
        decisionRationale: col(r, "rationale") ?? "(rationale not recorded)",
        decisionYear: Number.isInteger(year) && year > 1990 ? year : null,
        outcome: OUTCOMES.includes(outcomeRaw as PortfolioOutcome) ? (outcomeRaw as PortfolioOutcome) : "UNKNOWN",
        outcomeNotes: col(r, "outcome_notes"),
        sector: col(r, "sector"),
        modality: col(r, "modality"),
        indication: col(r, "indication"),
        stage: col(r, "stage"),
        createdById: user.id,
        ...deck,
      },
    });
    created.push(h.id);
  }
  await audit("training.archive_imported", { userId: user.id, meta: { rows: created.length } });
  scheduleIngest(created);
  revalidatePath("/training/archive");
  return {
    ok: true,
    message: `Imported ${created.length} deal${created.length === 1 ? "" : "s"}; ingestion is running in the background.${problems.length ? ` Issues: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? "…" : ""}` : ""}`,
  };
}

export async function retryIngestAction(id: string) {
  await requireRole("PARTNER");
  scheduleIngest([id]);
  revalidatePath("/training/archive");
}

export async function deleteHistoricalDealAction(id: string) {
  const user = await requireRole("PARTNER");
  await db.historicalDeal.delete({ where: { id } });
  await audit("training.archive_deleted", { userId: user.id, entity: "HistoricalDeal", entityId: id });
  revalidatePath("/training/archive");
}

// ─── Exemplars ──────────────────────────────────────────────────────────────

export async function saveExemplarAction(sourceAnalysisId: string, _: TrainState, fd: FormData): Promise<TrainState> {
  const user = await requireRole("PARTNER");
  const analysis = await db.analysis.findUnique({ where: { id: sourceAnalysisId }, include: { deal: true } });
  if (!analysis?.memo) return { ok: false, error: "Source memo not found." };
  const base = analysis.memo as unknown as Memo;
  const recommendation = str(fd, "recommendation") as Memo["recommendation"] | null;
  const commentary = str(fd, "partnerCommentary");
  if (!commentary) return { ok: false, error: "Add partner commentary: what makes this the standard to emulate." };

  const edited: Memo = {
    ...base,
    recommendation: recommendation ?? base.recommendation,
    overallScore: Number(str(fd, "overallScore") ?? base.overallScore),
    worthOurTime: {
      verdict: (recommendation ?? base.recommendation) !== "REJECT",
      headline: str(fd, "headline") ?? base.worthOurTime.headline,
      rationale: str(fd, "rationale") ?? base.worthOurTime.rationale,
    },
    executiveSummary: str(fd, "executiveSummary") ?? base.executiveSummary,
    scorecard: base.scorecard.map((s) => {
      const i = SCORE_DIMENSIONS.indexOf(s.dimension);
      return {
        ...s,
        score: Number(str(fd, `score_${i}`) ?? s.score),
        assessment: str(fd, `assessment_${i}`) ?? s.assessment,
      };
    }),
  };
  const parsed = MemoSchema.safeParse(edited);
  if (!parsed.success) return { ok: false, error: "The edited memo is incomplete." };
  const memo = normaliseMemo(parsed.data);

  const ex = await db.exemplar.create({
    data: {
      title: str(fd, "title") ?? analysis.deal.companyName,
      sourceAnalysisId,
      sector: analysis.deal.sector,
      modality: analysis.deal.modality,
      indication: analysis.deal.indication,
      tags: analysis.deal.tags,
      recommendation: memo.recommendation,
      overallScore: memo.overallScore,
      memo: memo as unknown as Prisma.InputJsonValue,
      partnerCommentary: commentary,
      createdById: user.id,
    },
  });
  // A corrected memo is also a calibration signal.
  if (memo.recommendation !== base.recommendation || Math.abs(memo.overallScore - base.overallScore) >= 10) {
    await db.analysisFeedback.create({
      data: {
        analysisId: sourceAnalysisId,
        userId: user.id,
        verdict: memo.recommendation !== base.recommendation ? "WRONG_DECISION" : memo.overallScore > base.overallScore ? "TOO_PESSIMISTIC" : "TOO_OPTIMISTIC",
        correctedRecommendation: memo.recommendation !== base.recommendation ? memo.recommendation : null,
        comment: commentary,
      },
    });
  }
  await audit("training.exemplar_saved", { userId: user.id, entity: "Exemplar", entityId: ex.id });
  redirect("/training/exemplars");
}

export async function toggleExemplarAction(id: string, active: boolean) {
  await requireRole("PARTNER");
  await db.exemplar.update({ where: { id }, data: { active } });
  revalidatePath("/training/exemplars");
}

// ─── Calibration → principles ───────────────────────────────────────────────

export async function generateSuggestionsAction(): Promise<TrainState> {
  const user = await requireRole("PARTNER");
  try {
    const n = await generatePrincipleSuggestions();
    await audit("training.suggestions_generated", { userId: user.id, meta: { n } });
    revalidatePath("/training/calibration");
    return { ok: true, message: n ? `${n} suggested principle${n === 1 ? "" : "s"} ready for review.` : "No clear pattern in the feedback yet." };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function resolveSuggestionAction(id: string, accept: boolean) {
  const user = await requireRole("PARTNER");
  const s = await db.principleSuggestion.update({ where: { id }, data: { status: accept ? "ACCEPTED" : "DISMISSED" } });
  if (accept) await db.investmentPrinciple.create({ data: { title: s.title, body: s.body } });
  await audit(accept ? "training.suggestion_accepted" : "training.suggestion_dismissed", { userId: user.id, entity: "PrincipleSuggestion", entityId: id });
  revalidatePath("/training/calibration");
  revalidatePath("/knowledge");
}

// ─── Backtests ──────────────────────────────────────────────────────────────

export async function startBacktestAction(_: TrainState, fd: FormData): Promise<TrainState> {
  const user = await requireRole("PARTNER");
  const limit = Math.min(200, Math.max(1, Number(str(fd, "limit") ?? 25)));
  const candidates = await db.historicalDeal.findMany({
    where: { ingestStatus: "READY", deckData: { not: null } },
    select: { id: true, decision: true },
    orderBy: { decisionYear: "desc" },
  });
  if (!candidates.length) return { ok: false, error: "Add historical deals with their original decks to the archive first." };
  // Balanced sample across decision types so agreement isn't flattered by the majority class.
  const byDecision = DECISIONS.map((d) => candidates.filter((c) => c.decision === d));
  const sample: typeof candidates = [];
  for (let i = 0; sample.length < Math.min(limit, candidates.length); i++) {
    for (const group of byDecision) if (group[i] && sample.length < limit) sample.push(group[i]);
  }
  const snapshot = await trainingSnapshot();
  const run = await db.backtestRun.create({
    data: {
      label: str(fd, "label") ?? `Backtest ${new Date().toLocaleDateString("en-CA")}`,
      config: snapshot,
      total: sample.length,
      createdById: user.id,
      results: { create: sample.map((c) => ({ historicalDealId: c.id, expected: expectedFor(c.decision) })) },
    },
  });
  await audit("training.backtest_started", { userId: user.id, entity: "BacktestRun", entityId: run.id });
  after(async () => {
    await runBacktest(run.id);
  });
  redirect(`/training/backtests/${run.id}`);
}

// ─── Firm parameters ────────────────────────────────────────────────────────

export async function saveFirmSettingsAction(_: TrainState, fd: FormData): Promise<TrainState> {
  const user = await requireRole("PARTNER");
  for (const s of FIRM_SETTINGS) {
    const value = str(fd, s.key);
    if (value) {
      await db.firmSetting.upsert({
        where: { key: s.key },
        create: { key: s.key, value: value.slice(0, 2000), updatedById: user.id },
        update: { value: value.slice(0, 2000), updatedById: user.id },
      });
    }
  }
  await audit("training.firm_settings_saved", { userId: user.id });
  revalidatePath("/training/prompt");
  return { ok: true, message: "Saved. These parameters apply to every analysis from now on." };
}

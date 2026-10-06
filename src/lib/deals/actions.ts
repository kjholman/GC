"use server";

import { createHash } from "node:crypto";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AnalysisTrigger, DealStatus, DocumentKind } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { FEEDBACK_AREA_IDS, FEEDBACK_AREA_LABEL } from "../feedback/options";
import { interpretFeedback } from "../feedback/interpret";
import { withMeter } from "../ai/usage";
import { audit } from "../audit";
import { refreshSlug } from "./slug";
import { requireRole, requireUser } from "../auth/session";
import { runAnalysis } from "../ai/analyst";
import { MAX_FILE_BYTES, extractText, resolveMimeType } from "../ai/extract";
import { pdfInfo } from "../ai/files";

export type ActionState = { ok: boolean; error?: string };

const KINDS: DocumentKind[] = [
  "PITCH_DECK",
  "FINANCIAL_MODEL",
  "SCIENTIFIC_DATA",
  "IP_DOCUMENTATION",
  "CLINICAL_REGULATORY",
  "CORRESPONDENCE",
  "OTHER",
];

function guessKind(filename: string, fallback: DocumentKind): DocumentKind {
  const f = filename.toLowerCase();
  if (/deck|pitch|presentation/.test(f)) return "PITCH_DECK";
  if (/model|financ|forecast|cap.?table|budget|\.xlsx$/.test(f)) return "FINANCIAL_MODEL";
  if (/patent|ip\b|fto|freedom/.test(f)) return "IP_DOCUMENTATION";
  if (/clinical|protocol|ind\b|510|fda|regulat/.test(f)) return "CLINICAL_REGULATORY";
  if (/data|study|results|poster|paper|publication/.test(f)) return "SCIENTIFIC_DATA";
  return fallback;
}

async function ingestFiles(files: File[], defaultKind: DocumentKind) {
  const prepared = [];
  for (const file of files) {
    if (file.size === 0) continue;
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`${file.name} is larger than 500 MB, the maximum the AI model provider accepts per file. Split it into parts and upload them together.`);
    }
    const mimeType = resolveMimeType(file.name, file.type);
    if (!mimeType) {
      throw new Error(`${file.name}: unsupported file type. Upload PDF, PPTX, DOCX, XLSX, CSV, TXT or images.`);
    }
    const buf = Buffer.from(await file.arrayBuffer());
    let extractedText: string | null = null;
    try {
      extractedText = await extractText(buf, mimeType);
    } catch {
      throw new Error(`${file.name} could not be read. If it is a deck, export it to PDF and try again.`);
    }
    // PDFs: record page count and text up front (for long-document handling and quote checks).
    let pdf: { pageCount: number; text: string } | null = null;
    if (mimeType === "application/pdf") pdf = await pdfInfo(buf).catch(() => null);
    prepared.push({
      pageCount: pdf?.pageCount ?? null,
      plainText: pdf?.text ?? null,
      filename: file.name.slice(0, 250),
      mimeType,
      sizeBytes: file.size,
      sha256: createHash("sha256").update(buf).digest("hex"),
      kind: guessKind(file.name, defaultKind),
      data: buf,
      extractedText,
    });
  }
  return prepared;
}

function scheduleAnalysis(analysisId: string) {
  after(async () => {
    await runAnalysis(analysisId);
  });
}

const NewDeal = z.object({
  companyName: z.string().trim().max(200).optional(),
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().max(200).optional(),
  source: z.string().trim().max(200).optional(),
  analystContext: z.string().trim().max(5000).optional(),
  instructions: z.string().trim().max(5000).optional(),
});

export async function createDealAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const fields = NewDeal.parse({
    companyName: formData.get("companyName") || undefined,
    contactName: formData.get("contactName") || undefined,
    contactEmail: formData.get("contactEmail") || undefined,
    source: formData.get("source") || undefined,
    analystContext: formData.get("analystContext") || undefined,
    instructions: formData.get("instructions") || undefined,
  });
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, error: "Attach the pitch deck to begin the analysis." };

  let docs;
  try {
    docs = await ingestFiles(files, "PITCH_DECK");
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const deal = await db.deal.create({
    data: {
      companyName: fields.companyName || `Untitled: ${files[0].name.replace(/\.[^.]+$/, "")}`,
      autoNamed: !fields.companyName,
      contactName: fields.contactName,
      contactEmail: fields.contactEmail,
      source: fields.source,
      ownerId: user.id,
      documents: { create: docs.map((d) => ({ ...d, round: 1, uploadedById: user.id })) },
      analyses: {
        create: { version: 1, trigger: "INITIAL_SCREEN", analystContext: fields.analystContext, instructions: fields.instructions, createdById: user.id },
      },
      activities: {
        create: {
          userId: user.id,
          type: "deal.created",
          message: `Deal submitted for screening with ${docs.length} document${docs.length === 1 ? "" : "s"}.`,
        },
      },
    },
    include: { analyses: true },
  });
  await audit("deal.created", { userId: user.id, entity: "Deal", entityId: deal.id });
  scheduleAnalysis(deal.analyses[0].id);
  redirect(`/deals/${await refreshSlug(deal.id)}`);
}

async function queueNewVersion(
  dealId: string,
  userId: string,
  trigger: AnalysisTrigger,
  analystContext?: string,
  opts: { instructions?: string; refreshResearch?: boolean } = {},
) {
  const last = await db.analysis.findFirst({ where: { dealId }, orderBy: { version: "desc" } });
  if (last && (last.status === "RUNNING" || last.status === "QUEUED")) {
    throw new Error("An analysis is already in progress for this deal.");
  }
  // A newer version supersedes any paused one, so it doesn't run again later.
  await db.analysis.updateMany({ where: { dealId, status: "PAUSED" }, data: { status: "STOPPED", error: "Replaced by a newer version." } });
  const deal = await db.deal.findUnique({ where: { id: dealId }, select: { status: true } });
  return db.analysis.create({
    data: {
      dealId,
      version: (last?.version ?? 0) + 1,
      trigger,
      analystContext,
      instructions: opts.instructions?.trim().slice(0, 5000) || null,
      refreshResearch: !!opts.refreshResearch,
      createdById: userId,
      priorDealStatus: deal?.status ?? null,
    },
  });
}

export async function submitFollowUpAction(dealId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const context = String(formData.get("analystContext") ?? "").trim().slice(0, 5000);
  const kindInput = String(formData.get("kind") ?? "OTHER") as DocumentKind;
  const defaultKind = KINDS.includes(kindInput) ? kindInput : "OTHER";
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length && !context) {
    return { ok: false, error: "Attach the new materials, or describe the information received." };
  }

  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) return { ok: false, error: "Deal not found." };

  try {
    const docs = await ingestFiles(files, defaultKind);
    const maxRound = await db.document.aggregate({ where: { dealId }, _max: { round: true } });
    const round = (maxRound._max.round ?? 1) + 1;
    const analysis = await queueNewVersion(dealId, user.id, "NEW_INFORMATION", context || undefined, { instructions: String(formData.get("instructions") ?? "") });
    await db.$transaction([
      ...docs.map((d) => db.document.create({ data: { ...d, dealId, round, uploadedById: user.id } })),
      db.deal.update({ where: { id: dealId }, data: { status: "SCREENING" } }),
      db.activity.create({
        data: {
          dealId,
          userId: user.id,
          type: "deal.reopened",
          message: `Reopened with new information (${docs.length} file${docs.length === 1 ? "" : "s"}${context ? ", with analyst notes" : ""}); was ${deal.status.replaceAll("_", " ").toLowerCase()}.`,
        },
      }),
    ]);
    await audit("deal.follow_up", { userId: user.id, entity: "Deal", entityId: dealId });
    scheduleAnalysis(analysis.id);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath("/deals/[id]", "page");
  return { ok: true };
}

/** Puts every analysis that paused for lack of credit back in the queue. */
export async function resumePausedAnalyses(): Promise<number> {
  await requireUser();
  const paused = await db.analysis.findMany({ where: { status: "PAUSED" }, select: { id: true } });
  for (const { id } of paused) {
    await db.analysis.update({ where: { id }, data: { status: "QUEUED", error: null, progress: "Resuming" } });
    scheduleAnalysis(id);
  }
  return paused.length;
}

export async function resumeAnalysisAction(analysisId: string): Promise<ActionState> {
  const user = await requireUser();
  const a = await db.analysis.findUnique({ where: { id: analysisId }, select: { dealId: true, version: true, status: true } });
  if (!a || a.status !== "PAUSED") return { ok: false, error: "This analysis isn't paused." };
  await db.analysis.update({ where: { id: analysisId }, data: { status: "QUEUED", error: null, progress: "Resuming" } });
  await db.activity.create({ data: { dealId: a.dealId, userId: user.id, type: "analysis.resumed", message: `Resumed the Sharminator's analysis (version ${a.version}).` } });
  scheduleAnalysis(analysisId);
  revalidatePath("/deals/[id]", "page");
  return { ok: true };
}

export async function stopAnalysisAction(analysisId: string): Promise<ActionState> {
  const user = await requireUser();
  const a = await db.analysis.findUnique({ where: { id: analysisId }, select: { dealId: true, version: true, status: true, priorDealStatus: true } });
  if (!a) return { ok: false, error: "That analysis no longer exists." };
  if (a.status !== "RUNNING" && a.status !== "QUEUED" && a.status !== "PAUSED") return { ok: false, error: "This analysis has already finished." };
  const who = user.name ?? user.email.split("@")[0];
  const entry = JSON.stringify([{ at: new Date().toISOString(), text: `Stopped by ${who}`, kind: "warn" }]);
  await db.$transaction([
    db.analysis.update({ where: { id: analysisId }, data: { status: "STOPPED", progress: null, completedAt: new Date(), error: `Stopped by ${who}.` } }),
    db.$executeRaw`UPDATE "Analysis" SET "steps" = COALESCE("steps", '[]'::jsonb) || ${entry}::jsonb WHERE "id" = ${analysisId}`,
    db.activity.create({ data: { dealId: a.dealId, userId: user.id, type: "analysis.stopped", message: `Stopped the Sharminator's analysis (version ${a.version}) before it finished.` } }),
    // A later version was stopped: the deal goes back to the stage it had from the previous analysis.
    ...(a.priorDealStatus ? [db.deal.update({ where: { id: a.dealId }, data: { status: a.priorDealStatus } })] : []),
  ]);
  await audit("analysis.stopped", { userId: user.id, entity: "Deal", entityId: a.dealId });
  revalidatePath("/deals/[id]", "page");
  return { ok: true };
}

export async function rerunAnalysisAction(dealId: string, opts: { instructions?: string; refreshResearch?: boolean } = {}): Promise<ActionState> {
  const user = await requireUser();
  try {
    const analysis = await queueNewVersion(dealId, user.id, "RERUN", undefined, opts);
    await db.activity.create({
      data: { dealId, userId: user.id, type: "analysis.rerun", message: `Asked the Sharminator to re-run the analysis (v${analysis.version})${analysis.instructions ? `, with instructions: "${analysis.instructions.slice(0, 300)}"` : ""}${analysis.refreshResearch ? "; web research redone" : ""}.` },
    });
    scheduleAnalysis(analysis.id);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath("/deals/[id]", "page");
  return { ok: true };
}

const STATUSES: DealStatus[] = ["SCREENING", "PENDING_INFO", "DILIGENCE", "IC_REVIEW", "INVESTED", "REJECTED", "ARCHIVED"];

export async function updateStatusAction(dealId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const status = String(formData.get("status")) as DealStatus;
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  if (!STATUSES.includes(status)) return { ok: false, error: "Invalid stage." };
  // Moving a deal to IC or recording an investment is a partner decision.
  const user = status === "IC_REVIEW" || status === "INVESTED" ? await requireRole("PARTNER") : await requireUser();
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) return { ok: false, error: "Deal not found." };
  if (deal.status === status) return { ok: true };
  await db.$transaction([
    db.deal.update({ where: { id: dealId }, data: { status } }),
    db.activity.create({
      data: {
        dealId,
        userId: user.id,
        type: "deal.status",
        message: `Moved from ${deal.status.replaceAll("_", " ").toLowerCase()} to ${status.replaceAll("_", " ").toLowerCase()}${note ? `: “${note}”` : ""}.`,
      },
    }),
  ]);
  await audit("deal.status_changed", { userId: user.id, entity: "Deal", entityId: dealId, meta: { from: deal.status, to: status } });
  revalidatePath("/deals/[id]", "page");
  return { ok: true };
}

export async function addNoteAction(dealId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const note = String(formData.get("note") ?? "").trim().slice(0, 5000);
  if (!note) return { ok: false, error: "Write a note first." };
  await db.activity.create({ data: { dealId, userId: user.id, type: "note", message: note } });
  revalidatePath("/deals/[id]", "page");
  return { ok: true };
}

export async function deleteDealAction(dealId: string) {
  const user = await requireRole("ADMIN");
  await db.deal.delete({ where: { id: dealId } });
  await audit("deal.deleted", { userId: user.id, entity: "Deal", entityId: dealId });
  redirect("/deals");
}

const VERDICTS = ["AGREE", "TOO_OPTIMISTIC", "TOO_PESSIMISTIC", "WRONG_DECISION"] as const;
const VERDICT_TEXT: Record<(typeof VERDICTS)[number], string> = {
  AGREE: "agreed with it",
  TOO_OPTIMISTIC: "too optimistic",
  TOO_PESSIMISTIC: "too pessimistic",
  WRONG_DECISION: "wrong decision",
};

/** Partner/analyst critique of a memo, fed into every future analysis as calibration. */
export async function submitFeedbackAction(analysisId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const verdict = String(formData.get("verdict")) as (typeof VERDICTS)[number];
  const corrected = String(formData.get("correctedRecommendation") ?? "") || null;
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 4000);
  const areas = [...new Set(formData.getAll("areas").map(String))].filter((a) => FEEDBACK_AREA_IDS.includes(a));
  if (!VERDICTS.includes(verdict)) return { ok: false, error: "Choose an overall view." };
  if (verdict !== "AGREE" && !areas.length && comment.length < 10) {
    return { ok: false, error: "Tick at least one issue or say what it got wrong. This is what the Sharminator learns from." };
  }
  const analysis = await db.analysis.findUnique({ where: { id: analysisId }, select: { dealId: true, version: true } });
  if (!analysis) return { ok: false, error: "Analysis not found." };
  const labels = areas.map((a) => FEEDBACK_AREA_LABEL[a]);
  const created = await db.analysisFeedback.create({
    data: {
      analysisId,
      userId: user.id,
      verdict,
      areas,
      correctedRecommendation: corrected && ["REJECT", "PENDING_INFO", "ADVANCE_TO_DILIGENCE"].includes(corrected) ? corrected : null,
      comment: comment || (labels.length ? labels.join("; ") : "Agree with the analysis."),
    },
  });
  // Turn the review into a lesson for future analyses, in the background.
  after(async () => {
    await withMeter({ purpose: "feedback lessons", analysisId }, () => interpretFeedback(created.id));
  });
  await db.activity.create({
    data: {
      dealId: analysis.dealId,
      userId: user.id,
      type: "feedback",
      message: `Reviewed memo version ${analysis.version}: ${VERDICT_TEXT[verdict]}${labels.length ? ` (${labels.join("; ")})` : ""}${comment ? `: “${comment.slice(0, 200)}”` : ""}`,
    },
  });
  await audit("analysis.feedback", { userId: user.id, entity: "Analysis", entityId: analysisId, meta: { verdict } });
  revalidatePath("/deals/[id]", "page");
  return { ok: true };
}

/** An analyst attests they have reviewed the memo and its fact-check before it is relied on or sent. */
export async function signOffAction(analysisId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const analysis = await db.analysis.findUnique({ where: { id: analysisId }, select: { dealId: true, version: true, verificationStatus: true, signedOffAt: true } });
  if (!analysis) return { ok: false, error: "Analysis not found." };
  if (analysis.signedOffAt) return { ok: true };
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  const acknowledged = formData.get("acknowledge") === "on";
  if (!acknowledged) return { ok: false, error: "Confirm you have reviewed the memo against the source materials." };
  if (analysis.verificationStatus !== "PASSED" && note.length < 10) {
    return { ok: false, error: "The fact-check flagged issues. Note how you resolved or accepted them." };
  }
  await db.analysis.update({ where: { id: analysisId }, data: { signedOffById: user.id, signedOffAt: new Date(), signOffNote: note || null } });
  await db.activity.create({
    data: { dealId: analysis.dealId, userId: user.id, type: "analysis.signed_off", message: `Signed off memo v${analysis.version}${note ? `: “${note.slice(0, 200)}”` : "."}` },
  });
  await audit("analysis.signed_off", { userId: user.id, entity: "Analysis", entityId: analysisId, meta: { verification: analysis.verificationStatus } });
  revalidatePath("/deals/[id]", "page");
  return { ok: true };
}

/** Replace (or, with no file, remove) a deal's logo by hand. */
export async function setLogoAction(dealId: string, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    if (!/^image\/(png|jpe?g|gif|webp|svg\+xml)$/.test(file.type)) return { ok: false, error: "Use a PNG, JPG, GIF, WEBP or SVG image." };
    if (file.size > 1024 * 1024) return { ok: false, error: "Use an image under 1 MB." };
    await db.deal.update({ where: { id: dealId }, data: { logo: Buffer.from(await file.arrayBuffer()), logoMime: file.type, logoCheckedAt: new Date() } });
  } else {
    await db.deal.update({ where: { id: dealId }, data: { logo: null, logoMime: null, logoCheckedAt: new Date() } });
  }
  await audit("deal.logo_changed", { userId: user.id, entity: "Deal", entityId: dealId });
  revalidatePath("/deals/[id]", "page");
  return { ok: true };
}

/** "Find logo": runs the full logo lookup now instead of waiting for the hourly retry. */
export async function findLogoNowAction(dealId: string): Promise<ActionState & { note?: string | null }> {
  await requireUser();
  const { findDealLogo } = await import("../ai/analyst");
  const found = await findDealLogo(dealId, { force: true });
  revalidatePath("/deals/[id]", "page");
  if (found) return { ok: true };
  const d = await db.deal.findUnique({ where: { id: dealId }, select: { logoNote: true } });
  return { ok: false, error: "No logo found automatically.", note: d?.logoNote ?? null };
}

/**
 * Removes one uploaded file from a deal. Nothing from it is used again: the deal
 * starts fresh, so later analyses don't reuse earlier memos, research or the
 * company summary that may have drawn on it.
 */
export async function removeDealDocumentAction(documentId: string): Promise<ActionState> {
  const user = await requireUser();
  const doc = await db.document.findUnique({ where: { id: documentId }, select: { dealId: true, filename: true } });
  if (!doc) return { ok: false, error: "That file has already been removed." };
  const running = await db.analysis.count({ where: { dealId: doc.dealId, status: { in: ["QUEUED", "RUNNING"] } } });
  if (running) return { ok: false, error: "Wait for the current analysis to finish (or stop it) before removing files." };
  await db.$transaction([
    db.document.delete({ where: { id: documentId } }),
    db.deal.update({ where: { id: doc.dealId }, data: { freshStartAt: new Date(), researchDossier: null, researchStore: Prisma.DbNull } }),
    db.activity.create({
      data: {
        dealId: doc.dealId,
        userId: user.id,
        type: "document.removed",
        message: `Removed ${doc.filename}. Analyses from now on won't use it or anything drawn from it.`,
      },
    }),
  ]);
  await audit("document.removed", { userId: user.id, entity: "Document", entityId: documentId, meta: { name: doc.filename } });
  revalidatePath("/deals/[id]", "page");
  return { ok: true };
}

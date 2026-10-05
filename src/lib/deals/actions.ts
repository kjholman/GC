"use server";

import { createHash } from "node:crypto";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AnalysisTrigger, DealStatus, DocumentKind } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { requireRole, requireUser } from "../auth/session";
import { runAnalysis } from "../ai/analyst";
import { MAX_FILE_BYTES, extractText, resolveMimeType } from "../ai/extract";

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
      throw new Error(`${file.name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
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
    prepared.push({
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
});

export async function createDealAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const fields = NewDeal.parse({
    companyName: formData.get("companyName") || undefined,
    contactName: formData.get("contactName") || undefined,
    contactEmail: formData.get("contactEmail") || undefined,
    source: formData.get("source") || undefined,
    analystContext: formData.get("analystContext") || undefined,
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
      companyName: fields.companyName || `Untitled — ${files[0].name.replace(/\.[^.]+$/, "")}`,
      contactName: fields.contactName,
      contactEmail: fields.contactEmail,
      source: fields.source,
      ownerId: user.id,
      documents: { create: docs.map((d) => ({ ...d, round: 1, uploadedById: user.id })) },
      analyses: {
        create: { version: 1, trigger: "INITIAL_SCREEN", analystContext: fields.analystContext, createdById: user.id },
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
  redirect(`/deals/${deal.id}`);
}

async function queueNewVersion(dealId: string, userId: string, trigger: AnalysisTrigger, analystContext?: string) {
  const last = await db.analysis.findFirst({ where: { dealId }, orderBy: { version: "desc" } });
  if (last && (last.status === "RUNNING" || last.status === "QUEUED")) {
    throw new Error("An analysis is already in progress for this deal.");
  }
  return db.analysis.create({
    data: { dealId, version: (last?.version ?? 0) + 1, trigger, analystContext, createdById: userId },
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
    const analysis = await queueNewVersion(dealId, user.id, "NEW_INFORMATION", context || undefined);
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
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

export async function rerunAnalysisAction(dealId: string): Promise<ActionState> {
  const user = await requireUser();
  try {
    const analysis = await queueNewVersion(dealId, user.id, "RERUN");
    await db.activity.create({
      data: { dealId, userId: user.id, type: "analysis.rerun", message: `Re-ran AI analysis (v${analysis.version}).` },
    });
    scheduleAnalysis(analysis.id);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath(`/deals/${dealId}`);
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
        message: `Moved from ${deal.status.replaceAll("_", " ").toLowerCase()} to ${status.replaceAll("_", " ").toLowerCase()}${note ? ` — “${note}”` : ""}.`,
      },
    }),
  ]);
  await audit("deal.status_changed", { userId: user.id, entity: "Deal", entityId: dealId, meta: { from: deal.status, to: status } });
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

export async function addNoteAction(dealId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const note = String(formData.get("note") ?? "").trim().slice(0, 5000);
  if (!note) return { ok: false, error: "Write a note first." };
  await db.activity.create({ data: { dealId, userId: user.id, type: "note", message: note } });
  revalidatePath(`/deals/${dealId}`);
  return { ok: true };
}

export async function deleteDealAction(dealId: string) {
  const user = await requireRole("ADMIN");
  await db.deal.delete({ where: { id: dealId } });
  await audit("deal.deleted", { userId: user.id, entity: "Deal", entityId: dealId });
  redirect("/deals");
}

const VERDICTS = ["AGREE", "TOO_OPTIMISTIC", "TOO_PESSIMISTIC", "WRONG_DECISION"] as const;

/** Partner/analyst critique of a memo — fed into every future analysis as calibration. */
export async function submitFeedbackAction(analysisId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const verdict = String(formData.get("verdict")) as (typeof VERDICTS)[number];
  const corrected = String(formData.get("correctedRecommendation") ?? "") || null;
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 4000);
  if (!VERDICTS.includes(verdict)) return { ok: false, error: "Choose an assessment." };
  if (verdict !== "AGREE" && comment.length < 10) {
    return { ok: false, error: "Explain your reasoning — this is what the analyst learns from." };
  }
  const analysis = await db.analysis.findUnique({ where: { id: analysisId }, select: { dealId: true, version: true } });
  if (!analysis) return { ok: false, error: "Analysis not found." };
  await db.analysisFeedback.create({
    data: {
      analysisId,
      userId: user.id,
      verdict,
      correctedRecommendation: corrected && ["REJECT", "PENDING_INFO", "ADVANCE_TO_DILIGENCE"].includes(corrected) ? corrected : null,
      comment: comment || "Agree with the analysis.",
    },
  });
  await db.activity.create({
    data: {
      dealId: analysis.dealId,
      userId: user.id,
      type: "feedback",
      message: `Reviewed memo v${analysis.version}: ${verdict.replaceAll("_", " ").toLowerCase()}${comment ? ` — “${comment.slice(0, 200)}”` : ""}`,
    },
  });
  await audit("analysis.feedback", { userId: user.id, entity: "Analysis", entityId: analysisId, meta: { verdict } });
  revalidatePath(`/deals/${analysis.dealId}`);
  return { ok: true };
}

"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "../db";
import { audit } from "../audit";
import { requireRole } from "../auth/session";
import { withMeter } from "../ai/usage";
import { ingestHistoricalDeal } from "../training/engine";
import { formatBytes, processKnowledgeFile, type FileScope } from "./files";

export type UploadState = { ok: boolean; message?: string; error?: string };

function pathsFor(scope: FileScope) {
  return scope === "PAST_DEAL" ? ["/training/archive"] : ["/knowledge"];
}

/**
 * Called after the browser has streamed the files to /api/knowledge-files/upload:
 * records the change and starts reading and summarising them in the background.
 */
export async function finishKnowledgeUploadAction(target: { scope: FileScope; id?: string | null }, fileIds: string[]): Promise<UploadState> {
  const user = await requireRole("PARTNER");
  const files = await db.knowledgeFile.findMany({ where: { id: { in: fileIds }, uploadedById: user.id }, select: { id: true, filename: true, sizeBytes: true } });
  if (!files.length) return { ok: false, error: "Nothing was uploaded." };
  const owner =
    target.scope === "PORTFOLIO" && target.id ? (await db.portfolioCompany.findUnique({ where: { id: target.id }, select: { name: true } }))?.name
    : target.scope === "PAST_DEAL" && target.id ? (await db.historicalDeal.findUnique({ where: { id: target.id }, select: { companyName: true } }))?.companyName
    : "Firm documents";
  await audit("knowledge.files_added", {
    userId: user.id,
    entity: target.scope,
    entityId: target.id ?? undefined,
    meta: { name: owner ?? null, changes: files.map((f) => ({ field: "File added", from: "(none)", to: `${f.filename} (${formatBytes(f.sizeBytes)})` })) },
  });
  const ids = files.map((f) => f.id);
  after(() =>
    withMeter({ purpose: "reading knowledge files" }, async () => {
      for (const id of ids) await processKnowledgeFile(id);
      // A past deal is re-read so its summary and precedent matching include the new files.
      if (target.scope === "PAST_DEAL" && target.id) await ingestHistoricalDeal(target.id);
    }),
  );
  for (const p of pathsFor(target.scope)) revalidatePath(p);
  return { ok: true, message: `${files.length} file${files.length === 1 ? "" : "s"} uploaded. GAIA is reading ${files.length === 1 ? "it" : "them"} now.` };
}

export async function deleteKnowledgeFileAction(id: string) {
  const user = await requireRole("PARTNER");
  const f = await db.knowledgeFile.delete({ where: { id } });
  await audit("knowledge.file_removed", {
    userId: user.id,
    entity: f.scope,
    entityId: f.portfolioCompanyId ?? f.historicalDealId ?? undefined,
    meta: { name: f.filename, changes: [{ field: "File", from: `${f.filename} (${formatBytes(f.sizeBytes)})`, to: "(removed)" }] },
  });
  if (f.scope === "PAST_DEAL" && f.historicalDealId) {
    const dealId = f.historicalDealId;
    after(() => withMeter({ purpose: "reading past deals" }, () => ingestHistoricalDeal(dealId)));
  }
  for (const p of pathsFor(f.scope as FileScope)) revalidatePath(p);
}

export async function retryKnowledgeFileAction(id: string) {
  await requireRole("PARTNER");
  await db.knowledgeFile.update({ where: { id }, data: { status: "READING" } });
  after(() => withMeter({ purpose: "reading knowledge files" }, () => processKnowledgeFile(id)));
  revalidatePath("/knowledge");
  revalidatePath("/training/archive");
}

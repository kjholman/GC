import "server-only";
import { z } from "zod";
import { db } from "../db";
import { extractText, familyOf, resolveMimeType } from "../ai/extract";
import { pdfInfo } from "../ai/files";
import { structuredCall, type ContentBlock } from "../ai/client";
import { plainPunctuation } from "../ai/style";

const CHUNK_BYTES = 16 * 1024 * 1024;
/** Above this, a file is kept for reference but not read (reading needs it in memory). */
const MAX_READ_BYTES = 300 * 1024 * 1024;
const MAX_TEXT_CHARS = 400_000;

export type FileScope = "FIRM" | "PORTFOLIO" | "PAST_DEAL";

/** Saves an uploaded file in 16 MB pieces, streaming so large files never sit in memory whole. */
export async function storeKnowledgeFile(file: File, meta: { scope: FileScope; portfolioCompanyId?: string | null; historicalDealId?: string | null; uploadedById: string }) {
  const record = await db.knowledgeFile.create({
    data: {
      scope: meta.scope,
      portfolioCompanyId: meta.portfolioCompanyId ?? null,
      historicalDealId: meta.historicalDealId ?? null,
      filename: file.name.slice(0, 250) || "file",
      mimeType: file.type || "application/octet-stream",
      sizeBytes: BigInt(file.size),
      uploadedById: meta.uploadedById,
    },
  });
  const reader = file.stream().getReader();
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let index = 0;
  const flush = async () => {
    if (!pendingBytes) return;
    await db.knowledgeFileChunk.create({ data: { fileId: record.id, index: index++, data: Buffer.concat(pending) } });
    pending = [];
    pendingBytes = 0;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending.push(value);
    pendingBytes += value.length;
    if (pendingBytes >= CHUNK_BYTES) await flush();
  }
  await flush();
  return record;
}

/** Streams a stored file back out, piece by piece. */
export function knowledgeFileStream(fileId: string): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    async pull(controller) {
      const chunk = await db.knowledgeFileChunk.findUnique({ where: { fileId_index: { fileId, index } } });
      if (!chunk) return controller.close();
      index++;
      controller.enqueue(new Uint8Array(chunk.data));
    },
  });
}

async function readAll(fileId: string): Promise<Buffer> {
  const chunks = await db.knowledgeFileChunk.findMany({ where: { fileId }, orderBy: { index: "asc" } });
  return Buffer.concat(chunks.map((c) => Buffer.from(c.data)));
}

/** Plain text if the bytes look like text (code, JSON, HTML, notes…), else null. */
function asText(buf: Buffer): string | null {
  const sample = buf.subarray(0, 8000);
  let printable = 0;
  for (const b of sample) if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 160) printable++;
  if (!sample.length || printable / sample.length < 0.9 || sample.includes(0)) return null;
  return buf.toString("utf8");
}

const SummarySchema = z.object({
  summary: z.string().describe("120-220 words: what this document is and what it tells an investor about Genesys, the company or the deal. Facts only, with key numbers. Plain business English."),
});

/** Reads one stored file and writes GAIA's summary of it. Never throws. */
export async function processKnowledgeFile(fileId: string): Promise<void> {
  const f = await db.knowledgeFile.findUnique({ where: { id: fileId } });
  if (!f) return;
  try {
    if (f.sizeBytes > BigInt(MAX_READ_BYTES)) {
      await db.knowledgeFile.update({ where: { id: fileId }, data: { status: "STORED", summary: null } });
      return;
    }
    const buf = await readAll(fileId);
    const mime = resolveMimeType(f.filename, f.mimeType);
    const family = mime ? familyOf(mime) : null;
    let text: string | null = null;
    let content: ContentBlock[] | null = null;
    if (family === "pdf") text = (await pdfInfo(buf).catch(() => null))?.text ?? null;
    else if (family === "image" && buf.length <= 5 * 1024 * 1024) content = [{ type: "image", source: { type: "base64", media_type: mime as "image/png" | "image/jpeg" | "image/webp", data: buf.toString("base64") } }];
    else if (family) text = await extractText(buf, mime!).catch(() => null);
    else text = asText(buf);

    if (!text?.trim() && !content) {
      await db.knowledgeFile.update({ where: { id: fileId }, data: { status: "STORED" } });
      return;
    }
    const body = text ? text.slice(0, MAX_TEXT_CHARS) : null;
    const { data } = await structuredCall({
      schema: SummarySchema,
      tier: "fast",
      step: "reading knowledge files",
      effort: "low",
      maxTokens: 6000,
      content: [
        ...(content ?? [{ type: "document", source: { type: "text", media_type: "text/plain", data: body! }, title: f.filename } as ContentBlock]),
        { type: "text", text: `Summarise "${f.filename}" for Genesys Capital's investment team. Use only what the file says.` },
      ],
    });
    await db.knowledgeFile.update({
      where: { id: fileId },
      data: { status: "READY", extractedText: body, summary: plainPunctuation(data.summary).slice(0, 3000) },
    });
    // Firm and portfolio files: suggest what to add to the knowledge base from them.
    if (f.scope !== "PAST_DEAL") {
      const { extractKnowledge, recordSuggestions } = await import("./suggest");
      const docContent: ContentBlock[] = content ?? [{ type: "document", source: { type: "text", media_type: "text/plain", data: body!.slice(0, 250_000) }, title: f.filename } as ContentBlock];
      const found = await extractKnowledge(
        docContent,
        f.scope === "PORTFOLIO"
          ? `Document: "${f.filename}", filed under one of Genesys's portfolio companies. Report what it says about that company (in portfolioCompanies), and leave the other lists empty.`
          : `Document: "${f.filename}".`,
      );
      const uploader = f.uploadedById ? await db.user.findUnique({ where: { id: f.uploadedById }, select: { name: true, email: true } }) : null;
      const label = uploader ? `${f.filename}, uploaded by ${uploader.name ?? uploader.email.split("@")[0]}` : f.filename;
      if (found) await recordSuggestions(found, { label, fileId: f.id, onlyCompanyId: f.scope === "PORTFOLIO" ? f.portfolioCompanyId : null });
    }
  } catch (err) {
    console.error("[knowledge] could not read file", fileId, err);
    await db.knowledgeFile.update({ where: { id: fileId }, data: { status: "FAILED" } }).catch(() => {});
  }
}

export function formatBytes(n: bigint | number): string {
  const v = Number(n);
  if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(1)} GB`;
  if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  if (v >= 1024) return `${Math.round(v / 1024)} KB`;
  return `${v} B`;
}

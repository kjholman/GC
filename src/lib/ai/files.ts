import "server-only";
import { toFile } from "@anthropic-ai/sdk";
import { extractText as pdfText, getDocumentProxy } from "unpdf";
import { anthropic, type ContentBlock } from "./client";
import { familyOf } from "./extract";

/**
 * Turns uploaded files of any size into model input.
 *
 * - Small files are sent inline (base64) with the request.
 * - Larger files are uploaded to Anthropic's Files API (up to 500 MB each) with a
 *   24-hour expiry and deleted as soon as the analysis finishes, so the 32 MB
 *   request limit never applies.
 * - PDFs over the model's 600-page visual limit are read as extracted text.
 * - If the combined materials exceed the context budget, lower-priority files
 *   are downgraded to text, then excerpted, and every such file is reported to
 *   the analyst and in the memo. Nothing is dropped silently.
 */

const INLINE_BYTES = 12 * 1024 * 1024; // keep total inline payload well under the 32 MB request cap
const MAX_VISUAL_PDF_PAGES = 600;
const TOKENS_PER_PDF_PAGE = 2500; // conservative: page image + text
const CHARS_PER_TOKEN = 3.5;
const DOC_TOKEN_BUDGET = 650_000; // leaves room in a 1M context for prompts, research and output

export type InputFile = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  data: Uint8Array;
  extractedText: string | null;
  plainText?: string | null;
  pageCount?: number | null;
  context: string;
};

export type PreparedFiles = {
  blocks: ContentBlock[];
  /** Files that could not be included at all. */
  omitted: string[];
  /** Files read as text only (figures and layout not seen). */
  textOnly: string[];
  /** Files of which only an excerpt fits. */
  partial: string[];
  cleanup: () => Promise<void>;
};

export async function pdfInfo(data: Uint8Array): Promise<{ pageCount: number; text: string }> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { totalPages, text } = await pdfText(pdf, { mergePages: false });
  return { pageCount: totalPages, text: (text as string[]).map((t, i) => `[page ${i + 1}]\n${t}`).join("\n") };
}

const estTextTokens = (s: string) => Math.ceil(s.length / CHARS_PER_TOKEN);

export async function prepareFiles(files: InputFile[]): Promise<PreparedFiles> {
  const blocks: ContentBlock[] = [];
  const omitted: string[] = [];
  const textOnly: string[] = [];
  const partial: string[] = [];
  const uploaded: string[] = [];
  let inlineBytes = 0;
  let tokens = 0;

  const textBlock = (f: InputFile, text: string, note: string) => {
    const remaining = DOC_TOKEN_BUDGET - tokens;
    if (remaining < 2000) {
      omitted.push(f.filename);
      return;
    }
    let body = text || "(no extractable text)";
    if (estTextTokens(body) > remaining) {
      body = body.slice(0, Math.floor(remaining * CHARS_PER_TOKEN));
      partial.push(f.filename);
      note += " Only the opening portion of this document fits in the analysis; the remainder was not read.";
    }
    tokens += estTextTokens(body);
    blocks.push({ type: "document", source: { type: "text", media_type: "text/plain", data: body }, title: f.filename, context: `${f.context}${note}` });
  };

  const upload = async (f: InputFile) => {
    const meta = await anthropic().files.upload({
      file: await toFile(Buffer.from(f.data), f.filename, { type: f.mimeType }),
      expires_in_seconds: 86_400,
    });
    uploaded.push(meta.id);
    return meta.id;
  };

  for (const f of files) {
    const family = familyOf(f.mimeType);

    if (f.extractedText != null) {
      textBlock(f, f.extractedText, "");
      continue;
    }

    if (family === "pdf") {
      let pages = f.pageCount ?? null;
      let text = f.plainText ?? null;
      if (pages == null || text == null) {
        try {
          const info = await pdfInfo(f.data);
          pages = info.pageCount;
          text = info.text;
        } catch {
          pages = pages ?? 0;
        }
      }
      const visualTokens = (pages || 1) * TOKENS_PER_PDF_PAGE;
      const fitsVisually = pages <= MAX_VISUAL_PDF_PAGES && tokens + visualTokens <= DOC_TOKEN_BUDGET;
      if (!fitsVisually) {
        if (text) {
          textOnly.push(f.filename);
          textBlock(f, text, pages > MAX_VISUAL_PDF_PAGES ? ` Read as text only (${pages} pages exceeds the visual limit); figures were not seen.` : " Read as text only to fit the analysis; figures were not seen.");
        } else {
          omitted.push(f.filename);
        }
        continue;
      }
      tokens += visualTokens;
      if (inlineBytes + f.sizeBytes <= INLINE_BYTES) {
        inlineBytes += f.sizeBytes;
        blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(f.data).toString("base64") }, title: f.filename, context: f.context });
      } else {
        blocks.push({ type: "document", source: { type: "file", file_id: await upload(f) }, title: f.filename, context: f.context });
      }
      continue;
    }

    if (family === "image") {
      if (tokens + 2000 > DOC_TOKEN_BUDGET) {
        omitted.push(f.filename);
        continue;
      }
      tokens += 2000;
      blocks.push({ type: "text", text: `Image: ${f.filename}. ${f.context}` });
      if (inlineBytes + f.sizeBytes <= INLINE_BYTES) {
        inlineBytes += f.sizeBytes;
        blocks.push({ type: "image", source: { type: "base64", media_type: f.mimeType as "image/png" | "image/jpeg" | "image/webp", data: Buffer.from(f.data).toString("base64") } });
      } else {
        blocks.push({ type: "image", source: { type: "file", file_id: await upload(f) } });
      }
    }
  }

  return {
    blocks,
    omitted,
    textOnly,
    partial,
    cleanup: async () => {
      await Promise.all(uploaded.map((id) => anthropic().files.delete(id).catch(() => undefined)));
    },
  };
}

/** Plain-language note for the analyst about files it could not read in full. */
export function coverageNote(p: Pick<PreparedFiles, "omitted" | "textOnly" | "partial">): string {
  const parts: string[] = [];
  if (p.textOnly.length) parts.push(`Read as text only, so charts and figures were not seen: ${p.textOnly.join(", ")}.`);
  if (p.partial.length) parts.push(`Only partly read because of their length: ${p.partial.join(", ")}.`);
  if (p.omitted.length) parts.push(`Not read at all because the materials exceed what one analysis can hold: ${p.omitted.join(", ")}.`);
  return parts.length
    ? `\n## Coverage of the materials\n${parts.join(" ")} State this in analystCaveats, and do not draw conclusions about content you have not read.`
    : "";
}

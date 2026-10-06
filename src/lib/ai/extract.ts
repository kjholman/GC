import JSZip from "jszip";
import ExcelJS from "exceljs";

/**
 * File types the platform accepts. PDFs and images go to the model natively
 * (it reads layout, charts and figures); Office formats are converted to text
 * server-side because the model API accepts PDF, image and text inputs.
 */
export const ACCEPTED = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "text",
  "text/plain": "text",
  "text/markdown": "text",
} as const;

export type FileFamily = (typeof ACCEPTED)[keyof typeof ACCEPTED];

const EXTENSION_TYPES: Record<string, keyof typeof ACCEPTED> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
};

/**
 * No app-imposed size limit beyond the model provider's own per-file ceiling
 * (Anthropic Files API: 500 MB). Large files are routed through the Files API.
 */
export const MAX_FILE_BYTES = 500 * 1024 * 1024;

export function resolveMimeType(filename: string, declared: string): keyof typeof ACCEPTED | null {
  if (declared in ACCEPTED) return declared as keyof typeof ACCEPTED;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[ext] ?? null;
}

export function familyOf(mime: string): FileFamily | null {
  return (ACCEPTED as Record<string, FileFamily>)[mime] ?? null;
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

function textRuns(xml: string, tag: "a:t" | "w:t"): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  return [...xml.matchAll(re)].map((m) => decodeXml(m[1]));
}

async function pptxToText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slideNo = (p: string) => Number(p.match(/(\d+)\.xml$/)?.[1] ?? 0);
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNo(a) - slideNo(b));
  const out: string[] = [];
  for (const path of slides) {
    const n = slideNo(path);
    const xml = await zip.file(path)!.async("string");
    const paragraphs = xml.split(/<\/a:p>/).map((p) => textRuns(p, "a:t").join("")).filter((t) => t.trim());
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    const notes = notesFile ? textRuns(await notesFile.async("string"), "a:t").join(" ").trim() : "";
    out.push(`--- Slide ${n} ---\n${paragraphs.join("\n")}${notes ? `\n[Speaker notes] ${notes}` : ""}`);
  }
  return out.join("\n\n");
}

async function docxToText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return xml
    .split(/<\/w:p>/)
    .map((p) => textRuns(p, "w:t").join(""))
    .filter((t) => t.trim())
    .join("\n");
}

async function xlsxToText(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const out: string[] = [];
  wb.eachSheet((sheet) => {
    out.push(`--- Sheet: ${sheet.name} ---`);
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value as unknown;
        let text: string;
        if (v && typeof v === "object" && "formula" in (v as object)) {
          const f = v as { formula: string; result?: unknown };
          text = `${f.result ?? ""} {=${f.formula}}`;
        } else if (v instanceof Date) {
          text = v.toISOString().slice(0, 10);
        } else if (v && typeof v === "object" && "richText" in (v as object)) {
          text = (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
        } else {
          text = v == null ? "" : String(v);
        }
        cells.push(text);
      });
      out.push(`R${rowNumber}: ${cells.join(" | ")}`);
    });
  });
  return out.join("\n");
}

/** Returns extracted text for non-native formats, or null for PDF/images. */
export async function extractText(buf: Buffer, mime: string): Promise<string | null> {
  switch (familyOf(mime)) {
    case "pptx":
      return pptxToText(buf);
    case "docx":
      return docxToText(buf);
    case "xlsx":
      return xlsxToText(buf);
    case "text":
      return buf.toString("utf8");
    default:
      return null;
  }
}

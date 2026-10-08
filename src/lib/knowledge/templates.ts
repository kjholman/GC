import "server-only";
import ExcelJS from "exceljs";

/**
 * Batch-import templates: the columns each import understands, with an example
 * row and plain-English guidance. Served as CSV or as Excel (with dropdowns for
 * fixed choices and a "How to fill" sheet).
 */
export type TemplateColumn = { key: string; label: string; help: string; example: string; choices?: string[]; required?: boolean };
export type Template = { name: string; title: string; filename: string; columns: TemplateColumn[] };

const OUTCOMES = ["Active", "Acquired", "IPO", "Merged", "Wound down", "Unknown"];
const SECTORS = ["Therapeutics", "Medical Devices", "Diagnostics", "Platform / Tools", "Digital Health"];

export const TEMPLATES: Record<string, Template> = {
  portfolio: {
    name: "portfolio",
    title: "Portfolio companies",
    filename: "genesys-portfolio-template",
    columns: [
      { key: "name", label: "Company", help: "Company name.", example: "Example Bio", required: true },
      { key: "website", label: "Website", help: "Lets GAIA recognise the company if it pitches again.", example: "examplebio.com" },
      { key: "sector", label: "Sector", help: "Pick from the list.", example: "Therapeutics", choices: SECTORS },
      { key: "modality", label: "Modality", help: "e.g. Small molecule, Antibody, Class II device.", example: "Small molecule" },
      { key: "indication", label: "Indication", help: "Lead indication.", example: "Fibrosis" },
      { key: "description", label: "Description", help: "One or two sentences on what it does.", example: "Oral small molecule for idiopathic pulmonary fibrosis." },
      { key: "year_invested", label: "Year invested", help: "Year of Genesys's first investment.", example: "2019" },
      { key: "stage_at_entry", label: "Stage at entry", help: "e.g. Seed, Series A, preclinical.", example: "Series A" },
      { key: "outcome", label: "Outcome", help: "Pick from the list.", example: "Active", choices: OUTCOMES },
      { key: "outcome_notes", label: "Outcome detail", help: "What happened, if anything.", example: "" },
      { key: "genesys_investment", label: "Genesys investment", help: "Write it naturally.", example: "C$3M across seed and A" },
      { key: "round_size", label: "Round size at entry", help: "", example: "C$12M Series A" },
      { key: "entry_valuation", label: "Valuation at entry", help: "", example: "C$25M pre-money" },
      { key: "ownership", label: "Ownership", help: "", example: "14% fully diluted" },
      { key: "co_investors", label: "Co-investors", help: "", example: "Lumira, BDC" },
      { key: "exit_value", label: "Exit or current value", help: "", example: "" },
      { key: "return", label: "Return", help: "Multiple or IRR.", example: "" },
      { key: "lessons", label: "Lessons", help: "What the partnership learned. GAIA quotes these.", example: "Board seat was essential during the CMC delays." },
    ],
  },
  principles: {
    name: "principles",
    title: "Investment principles",
    filename: "genesys-principles-template",
    columns: [
      { key: "title", label: "Title", help: "A short name.", example: "Composition-of-matter IP", required: true },
      { key: "principle", label: "Principle", help: "The rule or preference, in a sentence or two.", example: "We do not lead single-asset therapeutics deals without composition-of-matter protection.", required: true },
    ],
  },
  "past-deals": {
    name: "past-deals",
    title: "Past deals",
    filename: "genesys-past-deals-template",
    columns: [
      { key: "company", label: "Company", help: "Company name.", example: "Example Therapeutics", required: true },
      { key: "year", label: "Year", help: "Year of the decision.", example: "2019" },
      { key: "decision", label: "Decision", help: "Pick from the list.", example: "Passed at screening", choices: ["Invested", "Passed after diligence", "Passed at screening"], required: true },
      { key: "rationale", label: "Rationale", help: "Why Genesys decided as it did.", example: "Single in-vitro dataset; no composition-of-matter IP", required: true },
      { key: "outcome", label: "Outcome", help: "What happened to the company.", example: "Unknown", choices: OUTCOMES },
      { key: "outcome_notes", label: "Outcome detail", help: "", example: "" },
      { key: "sector", label: "Sector", help: "Left blank, GAIA fills it in.", example: "Therapeutics", choices: SECTORS },
      { key: "modality", label: "Modality", help: "", example: "Small molecule" },
      { key: "indication", label: "Indication", help: "", example: "NASH" },
      { key: "stage", label: "Stage", help: "", example: "Discovery" },
      { key: "deck_filename", label: "Deck filename", help: "Name of the deck file you attach alongside (several separated by ;).", example: "example-deck.pdf" },
    ],
  },
};

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function templateCsv(t: Template): string {
  return `${t.columns.map((c) => c.key).join(",")}\n${t.columns.map((c) => csvCell(c.example)).join(",")}\n`;
}

export async function templateXlsx(t: Template): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Genesys Capital";
  const ws = wb.addWorksheet("Fill in");
  ws.columns = t.columns.map((c) => ({ header: c.key, key: c.key, width: Math.max(14, Math.min(48, c.label.length + 8, c.example.length + 4)) }));
  ws.addRow(Object.fromEntries(t.columns.map((c) => [c.key, c.example])));
  ws.getRow(1).font = { bold: true, color: { argb: "FF17374D" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F1F3" } };
  ws.getRow(2).font = { italic: true, color: { argb: "FF5F7482" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  // Dropdowns for fixed choices, for the first 1,000 rows.
  t.columns.forEach((c, i) => {
    if (!c.choices) return;
    for (let r = 2; r <= 1000; r++) {
      ws.getCell(r, i + 1).dataValidation = { type: "list", allowBlank: !c.required, formulae: [`"${c.choices.join(",")}"`] };
    }
  });
  const help = wb.addWorksheet("How to fill");
  help.columns = [{ header: "Column", width: 22 }, { header: "What to put", width: 60 }, { header: "Choices", width: 50 }, { header: "Required", width: 10 }];
  help.getRow(1).font = { bold: true };
  for (const c of t.columns) help.addRow([c.key, [c.label, c.help].filter(Boolean).join(": "), c.choices?.join(", ") ?? "", c.required ? "Yes" : ""]);
  help.addRow([]);
  help.addRow(["", "Row 2 of the Fill in sheet is an example: replace or delete it. Leave any column blank if you don't know it."]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Reads an uploaded CSV or Excel file into rows of cells (first sheet for Excel). */
export async function readTable(file: File): Promise<string[][]> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (/\.xlsx$/i.test(file.name) || buf.subarray(0, 2).toString() === "PK") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets.find((w) => w.name !== "How to fill") ?? wb.worksheets[0];
    const rows: string[][] = [];
    ws?.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let i = 1; i <= ws.columnCount; i++) {
        const v = row.getCell(i).value as unknown;
        const text =
          v == null ? "" : typeof v === "object" && v && "text" in (v as object) ? String((v as { text: unknown }).text)
          : typeof v === "object" && v && "result" in (v as object) ? String((v as { result: unknown }).result ?? "")
          : v instanceof Date ? String(v.getFullYear()) : String(v);
        cells.push(text.trim());
      }
      if (cells.some(Boolean)) rows.push(cells);
    });
    return rows;
  }
  return parseCsv(buf.toString("utf8").replace(/^﻿/, ""));
}

export function parseCsv(text: string): string[][] {
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

/** Header keys normalised ("Year invested" → "year_invested"), so either the key or the label works. */
export function headerKeys(header: string[], t: Template): string[] {
  return header.map((h) => {
    const k = h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const byLabel = t.columns.find((c) => c.label.toLowerCase().replace(/[^a-z0-9]+/g, "_") === k);
    return byLabel?.key ?? k;
  });
}

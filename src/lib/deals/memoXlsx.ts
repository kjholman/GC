import "server-only";
import ExcelJS from "exceljs";
import type { Memo } from "../ai/schema";

/**
 * A working Excel model built from the memo's numbers: return scenarios with
 * live formulas (probability-weighted MOIC, implied IRR, expected proceeds on a
 * cheque size the partner can change), milestones and market sizing. Blue cells
 * are inputs, black cells are formulas, following the usual modelling convention.
 */

const NAVY = "FF17374D";
const INPUT = { color: { argb: "FF1F4FD1" } }; // blue = editable input
const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F1F3" } };
const REC: Record<string, string> = { REJECT: "Decline", PENDING_INFO: "Request information", ADVANCE_TO_DILIGENCE: "Advance to diligence" };
const nice = (v: string) => v.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function header(ws: ExcelJS.Worksheet, row: number, labels: string[]) {
  const r = ws.getRow(row);
  labels.forEach((l, i) => {
    const c = r.getCell(i + 1);
    c.value = l;
    c.font = { bold: true, color: { argb: NAVY } };
    c.fill = HEAD_FILL;
    c.border = { bottom: { style: "thin", color: { argb: "FFC9D3D7" } } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
}

function title(ws: ExcelJS.Worksheet, text: string, sub?: string) {
  ws.getCell("A1").value = text;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: NAVY } };
  if (sub) {
    ws.getCell("A2").value = sub;
    ws.getCell("A2").font = { italic: true, color: { argb: "FF5F7482" } };
  }
}

export async function memoToXlsx(args: { memo: Memo; companyName: string; version: number }): Promise<Buffer> {
  const { memo: m, companyName, version } = args;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Genesys Capital";
  wb.title = `${companyName}: financial model v${version}`;

  // Summary
  const sum = wb.addWorksheet("Summary");
  title(sum, `${companyName}: financial model`, `From the investment memo, version ${version}. Blue cells are inputs you can change; black cells are formulas.`);
  const facts: [string, string][] = [
    ["Recommendation", REC[m.recommendation] ?? m.recommendation],
    ["Score", `${m.overallScore}/100`],
    ["Stage", m.company.developmentStage],
    ["Round sought", m.company.roundSought ?? ""],
    ["Ask and use of funds", m.financials.askAndUseOfFunds],
    ["Valuation view", m.financials.valuationView],
    ["Burn and runway", m.financials.burnAndRunway],
    ["Capital to next inflection", m.financials.capitalToNextInflection],
    ["Projections", m.financials.projectionsCritique],
  ];
  facts.forEach(([k, v], i) => {
    const r = sum.getRow(4 + i);
    r.getCell(1).value = k;
    r.getCell(1).font = { bold: true, color: { argb: NAVY } };
    r.getCell(2).value = (v ?? "").replace(/\s?\[E\d+\]/g, "");
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    r.getCell(1).alignment = { vertical: "top" };
  });
  sum.getColumn(1).width = 28;
  sum.getColumn(2).width = 100;

  // Returns, with live formulas
  const ret = wb.addWorksheet("Returns");
  title(ret, "Return scenarios", "Gross multiple on Genesys capital. Change exit values, years, multiples or probabilities and everything recalculates.");
  ret.getCell("A4").value = "Genesys cheque (US$M)";
  ret.getCell("A4").font = { bold: true };
  ret.getCell("B4").value = 3;
  ret.getCell("B4").font = INPUT;
  ret.getCell("B4").numFmt = "#,##0.0";
  ret.getCell("C4").value = "Assumption: set to the planned cheque.";
  ret.getCell("C4").font = { italic: true, color: { argb: "FF5F7482" } };

  header(ret, 6, ["Scenario", "Exit route", "Exit value (US$M)", "Years to exit", "Gross MOIC", "Probability", "Weighted MOIC", "Implied IRR", "Proceeds (US$M)", "Rationale"]);
  const order = ["BEAR", "BASE", "BULL"];
  const scen = [...m.financials.returnScenarios].sort((a, b) => order.indexOf(a.scenario) - order.indexOf(b.scenario));
  let row = 7;
  for (const s of scen) {
    const r = ret.getRow(row);
    r.getCell(1).value = nice(s.scenario);
    r.getCell(2).value = s.exitRoute;
    r.getCell(3).value = s.exitValueUsdM ?? null;
    r.getCell(4).value = s.yearsToExit ?? null;
    r.getCell(5).value = s.grossMoic ?? null;
    r.getCell(6).value = s.probability > 1 ? s.probability / 100 : s.probability;
    [3, 4, 5, 6].forEach((c) => (r.getCell(c).font = INPUT));
    r.getCell(7).value = { formula: `E${row}*F${row}` };
    r.getCell(8).value = { formula: `IF(AND(E${row}>0,D${row}>0),E${row}^(1/D${row})-1,"")` };
    r.getCell(9).value = { formula: `$B$4*E${row}` };
    r.getCell(10).value = s.rationale.replace(/\s?\[E\d+\]/g, "");
    row++;
  }
  const first = 7;
  const last = row - 1;
  // Whatever probability the scenarios leave over is a write-off.
  const loss = ret.getRow(row);
  loss.getCell(1).value = "Loss";
  loss.getCell(2).value = "Write-off (probability not covered by the scenarios)";
  loss.getCell(5).value = 0;
  loss.getCell(6).value = { formula: `MAX(0,1-SUM(F${first}:F${last}))` };
  loss.getCell(7).value = { formula: `E${row}*F${row}` };
  loss.getCell(9).value = { formula: `$B$4*E${row}` };
  const lossRow = row;
  row += 2;
  const tot = ret.getRow(row);
  tot.getCell(1).value = "Expected (probability-weighted)";
  tot.getCell(1).font = { bold: true };
  tot.getCell(6).value = { formula: `SUM(F${first}:F${lossRow})` };
  tot.getCell(7).value = { formula: `SUM(G${first}:G${lossRow})` };
  tot.getCell(9).value = { formula: `$B$4*G${row}` };
  [6, 7, 9].forEach((c) => (tot.getCell(c).font = { bold: true }));
  for (let r = first; r <= row; r++) {
    ret.getCell(`C${r}`).numFmt = "#,##0";
    ret.getCell(`D${r}`).numFmt = "0.0";
    ret.getCell(`E${r}`).numFmt = '0.0"x"';
    ret.getCell(`F${r}`).numFmt = "0%";
    ret.getCell(`G${r}`).numFmt = '0.00"x"';
    ret.getCell(`H${r}`).numFmt = "0%";
    ret.getCell(`I${r}`).numFmt = "#,##0.0";
    ret.getCell(`J${r}`).alignment = { wrapText: true, vertical: "top" };
    ret.getCell(`B${r}`).alignment = { wrapText: true, vertical: "top" };
  }
  [14, 34, 16, 12, 12, 12, 14, 12, 14, 60].forEach((w, i) => (ret.getColumn(i + 1).width = w));

  // Milestones
  const ms = wb.addWorksheet("Milestones");
  title(ms, "Milestones and capital", m.clinicalRegulatory.pathway.replace(/\s?\[E\d+\]/g, "").slice(0, 250));
  header(ms, 4, ["Milestone", "Expected timing", "Capital required", "Value inflection"]);
  m.clinicalRegulatory.milestones.forEach((x, i) => {
    const r = ms.getRow(5 + i);
    r.getCell(1).value = x.milestone.replace(/\s?\[E\d+\]/g, "");
    r.getCell(2).value = x.expectedTiming;
    r.getCell(3).value = x.capitalRequired ?? "";
    r.getCell(4).value = x.valueInflection ? "Yes" : "No";
    r.getCell(1).alignment = { wrapText: true, vertical: "top" };
  });
  [60, 20, 22, 16].forEach((w, i) => (ms.getColumn(i + 1).width = w));

  // Market sizing
  const mk = wb.addWorksheet("Market");
  const sz = m.market.marketSizing;
  title(mk, "Market sizing", sz?.method?.replace(/\s?\[E\d+\]/g, "").slice(0, 250));
  header(mk, 4, ["Measure", "US$M"]);
  const sizes: [string, number | null | undefined][] = [
    ["Total addressable market (TAM)", sz?.tamUsdM],
    ["Serviceable market (SAM)", sz?.samUsdM],
    ["Peak sales: low", sz?.peakSalesUsdM?.low],
    ["Peak sales: base", sz?.peakSalesUsdM?.base],
    ["Peak sales: high", sz?.peakSalesUsdM?.high],
  ];
  sizes.forEach(([k, v], i) => {
    const r = mk.getRow(5 + i);
    r.getCell(1).value = k;
    r.getCell(2).value = v ?? null;
    r.getCell(2).font = INPUT;
    r.getCell(2).numFmt = "#,##0";
  });
  mk.getRow(11).getCell(1).value = "Base peak sales as a share of SAM";
  mk.getRow(11).getCell(2).value = { formula: 'IF(AND(B6>0,B8>0),B8/B6,"")' };
  mk.getRow(11).getCell(2).numFmt = "0.0%";
  let ar = 13;
  if (sz?.assumptions?.length) {
    mk.getRow(ar).getCell(1).value = "Assumptions";
    mk.getRow(ar).getCell(1).font = { bold: true, color: { argb: NAVY } };
    for (const a of sz.assumptions) {
      ar++;
      mk.getRow(ar).getCell(1).value = `• ${a.replace(/\s?\[E\d+\]/g, "")}`;
      mk.getRow(ar).getCell(1).alignment = { wrapText: true };
    }
  }
  mk.getColumn(1).width = 80;
  mk.getColumn(2).width = 14;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

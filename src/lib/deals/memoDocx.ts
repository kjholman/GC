import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Memo } from "../ai/schema";

/**
 * The investment memo as an editable Word document, for partners to annotate,
 * comment on and track changes. Internal-only material (the meme, the draft
 * founder email) is left out so the file is safe to forward within the firm.
 */

const NAVY = "17374D";
const TEAL = "1F8A9C";
const GREY = "5F7482";
const FONT = "Calibri";
const PAGE_WIDTH = 9360; // US Letter, 1" margins, in twentieths of a point

const REC_LABEL: Record<string, string> = { REJECT: "Decline", PENDING_INFO: "Request information", ADVANCE_TO_DILIGENCE: "Advance to diligence" };
const nice = (v: string) => v.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const money = (n: number | null | undefined) => (n == null ? "n/a" : `US$${n.toLocaleString("en-US", { maximumFractionDigits: 1 })}M`);

function runs(text: string, opts: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) {
  return [new TextRun({ text, font: FONT, ...opts })];
}

/** Body text: blank lines start new paragraphs; single line breaks are kept. */
function paras(text: string | null | undefined): Paragraph[] {
  if (!text?.trim()) return [];
  return text
    .trim()
    .split(/\n{2,}/)
    .map(
      (p) =>
        new Paragraph({
          spacing: { after: 120, line: 288 },
          children: lineRuns(p),
        }),
    );
}

const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 120 }, children: runs(text, { bold: true, color: NAVY, size: 30 }) });
const h2 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: runs(text, { bold: true, color: TEAL, size: 24 }) });

function lineRuns(p: string): TextRun[] {
  return p.split("\n").flatMap((line, i) => [...(i ? [new TextRun({ break: 1 })] : []), new TextRun({ text: line, font: FONT, size: 22 })]);
}

/** "Label: text", with the label in bold; later paragraphs follow as plain body text. */
function labelled(label: string, text: string | null | undefined): Paragraph[] {
  if (!text?.trim()) return [];
  const [first, ...rest] = text.trim().split(/\n{2,}/);
  return [
    new Paragraph({ spacing: { after: 120, line: 288 }, children: [new TextRun({ text: `${label}: `, font: FONT, size: 22, bold: true, color: NAVY }), ...lineRuns(first)] }),
    ...rest.map((p) => new Paragraph({ spacing: { after: 120, line: 288 }, children: lineRuns(p) })),
  ];
}

function bullets(items: (string | null | undefined)[]): Paragraph[] {
  return items.filter((t): t is string => !!t?.trim()).map((t) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: runs(t, { size: 22 }) }));
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "C9D3D7" };
const borders = { top: border, bottom: border, left: border, right: border };

/** A simple bordered table; widths are fractions of the page width. */
function table(headers: string[], rows: string[][], widths: number[]): Table {
  const cols = widths.map((w) => Math.round(w * PAGE_WIDTH));
  const cell = (text: string, i: number, head: boolean) =>
    new TableCell({
      borders,
      width: { size: cols[i], type: WidthType.DXA },
      shading: head ? { fill: "E8F1F3", type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: (text || "").split(/\n{2,}/).map((p) => new Paragraph({ children: runs(p, { size: 19, bold: head, color: head ? NAVY : undefined }) })),
    });
  return new Table({
    width: { size: PAGE_WIDTH, type: WidthType.DXA },
    columnWidths: cols,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) }))],
  });
}

const gap = () => new Paragraph({ spacing: { after: 120 }, children: [] });

export async function memoToDocx(args: { memo: Memo; companyName: string; version: number; date: Date; factCheck?: string | null }): Promise<Buffer> {
  const { memo: m, companyName, version, date } = args;
  const body: (Paragraph | Table)[] = [];

  // Cover block
  body.push(
    new Paragraph({ children: runs("GENESYS CAPITAL · INVESTMENT MEMO", { bold: true, color: TEAL, size: 18 }) }),
    new Paragraph({ heading: HeadingLevel.TITLE, spacing: { before: 120, after: 80 }, children: runs(companyName, { bold: true, color: NAVY, size: 48 }) }),
    ...(m.company.oneLiner ? [new Paragraph({ spacing: { after: 200 }, children: runs(m.company.oneLiner, { italics: true, color: GREY, size: 24 }) })] : []),
    table(
      ["Recommendation", "Score", "Conviction", "Version", "Date"],
      [[REC_LABEL[m.recommendation] ?? m.recommendation, `${m.overallScore}/100`, nice(m.conviction), `v${version}`, date.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Toronto" })]],
      [0.28, 0.14, 0.16, 0.12, 0.3],
    ),
    gap(),
    table(
      ["Sector", "Modality", "Lead indication", "Stage", "Round sought"],
      [[m.company.sector, m.company.modality, m.company.leadIndication ?? "", m.company.developmentStage, m.company.roundSought ?? ""]],
      [0.18, 0.2, 0.24, 0.18, 0.2],
    ),
  );
  if (args.factCheck) body.push(new Paragraph({ spacing: { before: 120 }, children: runs(`Fact-check: ${args.factCheck}`, { size: 19, color: GREY }) }));

  // Summary
  body.push(h1("Is it worth our time?"), new Paragraph({ spacing: { after: 100 }, children: runs(m.worthOurTime.headline, { bold: true, size: 24, color: NAVY }) }), ...paras(m.worthOurTime.rationale));
  body.push(h1("Executive summary"), ...paras(m.executiveSummary));
  if (m.investmentHighlights.length) body.push(h2("Investment highlights"), ...bullets(m.investmentHighlights));
  if (m.keyRisks.length) body.push(h2("Key risks"), table(["Risk", "Severity", "Mitigation"], m.keyRisks.map((r) => [r.risk, nice(r.severity), r.mitigation]), [0.44, 0.12, 0.44]));
  if (m.redFlags?.length) body.push(h2("Red flags"), ...bullets(m.redFlags));
  if (m.passReasons?.length) {
    body.push(h2("Reasons not to pursue"));
    for (const p of m.passReasons) body.push(new Paragraph({ spacing: { before: 80 }, children: runs(p.reason, { bold: true, size: 22 }) }), ...paras(p.explanation), ...labelled("Would change if", p.wouldChangeIf));
  }

  // Scorecard
  body.push(h1("Scorecard"), table(["Dimension", "Score", "Assessment", "Evidence"], m.scorecard.map((s) => [s.dimension, `${s.score}`, s.assessment, s.evidence]), [0.2, 0.08, 0.4, 0.32]));

  // Science
  body.push(
    h1("Science"),
    ...labelled("Mechanism of action", m.science.mechanismOfAction),
    ...labelled("Biological rationale", m.science.biologicalRationale),
    ...labelled("Data quality", m.science.dataQuality),
    ...labelled("Translational risk", m.science.translationalRisk),
  );
  if (m.science.keyExperimentsToDerisk.length) body.push(h2("Experiments that would de-risk it"), ...bullets(m.science.keyExperimentsToDerisk));

  // Clinical and regulatory
  body.push(h1("Clinical and regulatory path"), ...labelled("Pathway", m.clinicalRegulatory.pathway), ...labelled("Probability of success", m.clinicalRegulatory.probabilityOfSuccess));
  if (m.clinicalRegulatory.milestones.length)
    body.push(
      table(["Milestone", "Timing", "Capital required", "Value inflection"], m.clinicalRegulatory.milestones.map((x) => [x.milestone, x.expectedTiming, x.capitalRequired ?? "", x.valueInflection ? "Yes" : "No"]), [0.4, 0.2, 0.22, 0.18]),
    );

  // IP
  const ip = m.intellectualProperty;
  body.push(h1("Intellectual property"), ...labelled("Strength", nice(ip.strength)), ...labelled("Position", ip.position));
  if (ip.assets?.length)
    body.push(
      table(
        ["Identifier", "Title", "Type", "Status", "Owner", "Expiry"],
        ip.assets.map((a) => [a.identifier ?? "", a.title, nice(a.type), nice(a.status), a.ownerOrAssignee ?? "", a.estimatedExpiry ?? ""]),
        [0.15, 0.3, 0.14, 0.12, 0.17, 0.12],
      ),
      gap(),
    );
  body.push(
    ...labelled("Ownership and licensing", ip.ownershipAndLicensing),
    ...labelled("Freedom to operate", ip.freedomToOperate),
    ...labelled("Exclusivity runway", ip.exclusivityRunway),
    ...labelled("Trade secrets and know-how", ip.tradeSecretsAndKnowHow),
  );
  if (ip.concerns?.length) body.push(h2("IP concerns"), ...bullets(ip.concerns));

  // Market
  const mk = m.market;
  body.push(h1("Market and competitors"), ...labelled("Unmet need", mk.unmetNeed), ...labelled("Standard of care", mk.standardOfCare), ...labelled("Addressable market", mk.addressableMarket));
  const sz = mk.marketSizing;
  if (sz) {
    body.push(table(["TAM", "SAM", "Peak sales (low / base / high)"], [[money(sz.tamUsdM), money(sz.samUsdM), `${money(sz.peakSalesUsdM?.low)} / ${money(sz.peakSalesUsdM?.base)} / ${money(sz.peakSalesUsdM?.high)}`]], [0.25, 0.25, 0.5]), gap());
    body.push(...labelled("Sizing method", sz.method), ...labelled("Critique of the deck's market claims", sz.deckClaimCritique));
  }
  body.push(...labelled("Reimbursement and access", mk.reimbursementAndAccess), ...labelled("Market timing", mk.marketTiming));
  if (mk.competitors.length) body.push(h2("Competitors"), table(["Company", "Stage", "How it differs"], mk.competitors.map((c) => [c.name, c.stage, c.differentiation]), [0.25, 0.2, 0.55]));
  if (mk.likelyAcquirers?.length) body.push(h2("Likely acquirers"), ...bullets(mk.likelyAcquirers));
  body.push(...labelled("Comparable outcomes", mk.comparableOutcomes));

  // Team
  const t = m.team;
  body.push(h1("Founders and team"), ...paras(t.assessment));
  if (t.members.length) body.push(table(["Name", "Role", "Background", "Verified"], t.members.map((p) => [p.name, p.role, p.background, nice(p.verification)]), [0.18, 0.18, 0.48, 0.16]), gap());
  body.push(...labelled("Founder-market fit", t.founderMarketFit), ...labelled("Board and advisors", t.boardAndAdvisors));
  if (t.strengths?.length) body.push(h2("Strengths"), ...bullets(t.strengths));
  if (t.gaps?.length) body.push(h2("Team gaps"), ...bullets(t.gaps));

  // Financials
  const f = m.financials;
  body.push(
    h1("Financials and round"),
    ...labelled("Ask and use of funds", f.askAndUseOfFunds),
    ...labelled("Valuation", f.valuationView),
    ...labelled("Burn and runway", f.burnAndRunway),
    ...labelled("Capital to next inflection", f.capitalToNextInflection),
    ...labelled("Projections", f.projectionsCritique),
  );
  if (f.returnScenarios.length)
    body.push(
      h2("Return scenarios"),
      table(
        ["Scenario", "Exit route", "Exit value", "Years", "Gross MOIC", "Probability"],
        f.returnScenarios.map((r) => [nice(r.scenario), r.exitRoute, money(r.exitValueUsdM), r.yearsToExit == null ? "n/a" : `${r.yearsToExit}`, r.grossMoic == null ? "n/a" : `${r.grossMoic}x`, `${Math.round(r.probability * (r.probability <= 1 ? 100 : 1))}%`]),
        [0.12, 0.3, 0.16, 0.1, 0.16, 0.16],
      ),
    );

  // Fit
  const pf = m.portfolioFit;
  body.push(h1("Fit with Genesys"), ...labelled("Thesis alignment", pf.thesisAlignment), ...labelled("Canadian nexus", pf.canadianNexus), ...labelled("Syndicate", pf.syndicateView), ...labelled("Portfolio conflicts", pf.portfolioConflicts));
  if (pf.comparableGenesysInvestments.length) body.push(h2("Comparable Genesys investments"), table(["Company", "Similarity", "Lesson"], pf.comparableGenesysInvestments.map((c) => [c.company, c.similarity, c.lesson]), [0.22, 0.39, 0.39]));

  // Next steps
  if (m.informationRequests.length) body.push(h1("Questions for the founders"), table(["Priority", "Request", "Why"], m.informationRequests.map((r) => [nice(r.priority), r.request, r.rationale]), [0.14, 0.46, 0.4]));
  if (m.dueDiligencePlan) {
    const d = m.dueDiligencePlan;
    body.push(h1("Diligence plan"), new Paragraph({ spacing: { after: 100 }, children: runs(`Estimated ${d.estimatedTotalWeeks} weeks in total.`, { size: 22, color: GREY }) }));
    for (const w of d.workstreams) body.push(h2(`${w.name} (${w.durationWeeks} weeks)`), ...paras(w.objective), ...bullets(w.tasks));
    if (d.criticalQuestionsForIC.length) body.push(h2("Critical questions for IC"), ...bullets(d.criticalQuestionsForIC));
  }
  if (m.gaps?.length) body.push(h1("Gaps needing follow-up"), table(["Area", "Gap", "Why it is a gap", "How to close it"], m.gaps.map((g) => [g.area, g.gap, g.whyItIsAGap, g.howToClose]), [0.14, 0.28, 0.29, 0.29]));
  if (m.analystCaveats?.trim()) body.push(h1("Caveats"), ...paras(m.analystCaveats));

  // Evidence ledger: what [E1], [E2]… in the text refer to.
  if (m.evidence?.length)
    body.push(h1("Evidence and sources"), table(["Ref", "Claim", "Source", "Status"], m.evidence.map((e) => [e.id, e.claim, [e.sourceRef, e.quote ? `"${e.quote}"` : ""].filter(Boolean).join("\n\n"), nice(e.status)]), [0.07, 0.38, 0.41, 0.14]));

  const doc = new Document({
    creator: "Genesys Capital",
    title: `${companyName}: investment memo v${version}`,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] }] },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: `${companyName} · Genesys Capital · Confidential · Page `, font: FONT, size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GREY })],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

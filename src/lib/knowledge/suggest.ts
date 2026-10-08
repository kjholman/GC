import "server-only";
import { z } from "zod";
import type { PortfolioOutcome, Prisma } from "@prisma/client";
import { db } from "../db";
import { structuredCall, type ContentBlock } from "../ai/client";
import { plainPunctuation } from "../ai/style";
import { FIRM_SETTINGS } from "../training/settings";
import { cleanDomain } from "../deals/logo";
import { coreName } from "../deals/portfolio";

/**
 * Turns documents (and web research) into suggestions for the knowledge base:
 * new portfolio companies, missing details on existing ones, investment
 * principles, firm settings and past decisions. Partners review and accept them,
 * so nobody has to retype what is already written down somewhere.
 */

const OUTCOMES = ["ACTIVE", "ACQUIRED", "IPO", "MERGED", "WOUND_DOWN", "UNKNOWN"] as const;
const DECISIONS = ["INVESTED", "PASSED_AFTER_DILIGENCE", "PASSED_AT_SCREENING"] as const;
const SETTING_KEYS = FIRM_SETTINGS.map((s) => s.key) as [string, ...string[]];
const blank = 'Empty string if the document does not say.';

const CompanySchema = z.object({
  name: z.string(),
  website: z.string().describe(`Company website domain. ${blank}`),
  sector: z.string().describe(`One of Therapeutics, Medical Devices, Diagnostics, Platform / Tools, Digital Health. ${blank}`),
  modality: z.string().describe(blank),
  indication: z.string().describe(blank),
  description: z.string().describe(`One or two sentences on what the company does. ${blank}`),
  yearInvested: z.string().describe(`Year Genesys first invested, e.g. "2019". ${blank}`),
  stageAtEntry: z.string().describe(blank),
  outcome: z.enum(OUTCOMES).describe("UNKNOWN if not stated."),
  outcomeNotes: z.string().describe(blank),
  checkSize: z.string().describe(`Genesys's investment, as written, e.g. "C$3M across seed and A". ${blank}`),
  roundSize: z.string().describe(blank),
  entryValuation: z.string().describe(blank),
  ownership: z.string().describe(blank),
  coInvestors: z.string().describe(blank),
  exitValue: z.string().describe(`Exit or latest value. ${blank}`),
  returnMultiple: z.string().describe(`Multiple or IRR. ${blank}`),
  lessons: z.string().describe(`What the partners say they learned. ${blank}`),
});

const ExtractSchema = z.object({
  portfolioCompanies: z.array(CompanySchema).describe("Companies Genesys Capital has invested in that the document describes. Not companies Genesys passed on, not competitors."),
  principles: z
    .array(z.object({ title: z.string().describe("Short name, under 8 words."), body: z.string().describe("The rule or preference in one or two sentences.") }))
    .describe("Standing investment rules or preferences the document states for Genesys (e.g. 'we only lead with composition-of-matter IP'). Only rules actually stated, never invented."),
  settings: z
    .array(z.object({ key: z.enum(SETTING_KEYS), value: z.string() }))
    .describe(`Firm parameters the document states: ${FIRM_SETTINGS.map((s) => `${s.key} (${s.label})`).join(", ")}.`),
  pastDeals: z
    .array(
      z.object({
        companyName: z.string(),
        year: z.string().describe(blank),
        decision: z.enum(DECISIONS),
        rationale: z.string().describe("Why Genesys decided as it did."),
        outcome: z.enum(OUTCOMES),
        sector: z.string().describe(blank),
      }),
    )
    .describe("Past investment decisions the document records, including deals Genesys passed on, with the reasoning."),
});
export type Extracted = z.infer<typeof ExtractSchema>;
type Company = z.infer<typeof CompanySchema>;

const EXTRACT_PROMPT = `You are reading a document for Genesys Capital, a Canadian life-sciences venture capital firm, to update its internal knowledge base.
Extract only what the document actually states. Never guess or fill in from general knowledge. If something is not in the document, leave it empty or the list empty.`;

/** Reads text (or other content) and returns what it says about Genesys. */
export async function extractKnowledge(content: ContentBlock[], hint: string): Promise<Extracted | null> {
  try {
    const { data } = await structuredCall({
      schema: ExtractSchema,
      tier: "fast",
      step: "knowledge extraction",
      effort: "low",
      maxTokens: 16000,
      content: [...content, { type: "text", text: `${EXTRACT_PROMPT}\n\n${hint}` }],
    });
    return data;
  } catch (err) {
    console.error("[knowledge] extraction failed", err);
    return null;
  }
}

const COMPANY_FIELDS: (keyof Company)[] = [
  "website", "sector", "modality", "indication", "description", "yearInvested", "stageAtEntry", "outcome", "outcomeNotes",
  "checkSize", "roundSize", "entryValuation", "ownership", "coInvestors", "exitValue", "returnMultiple", "lessons",
];
/** Fields where a newer document should be able to update what's on record (status and results change). */
const UPDATABLE: (keyof Company)[] = ["outcome", "outcomeNotes", "exitValue", "returnMultiple"];

export const FIELD_LABEL: Record<string, string> = {
  name: "Company", website: "Website", sector: "Sector", modality: "Modality", indication: "Indication", description: "Description",
  yearInvested: "Year invested", stageAtEntry: "Entry stage", outcome: "Outcome", outcomeNotes: "Outcome detail", checkSize: "Genesys investment",
  roundSize: "Round size at entry", entryValuation: "Valuation at entry", ownership: "Ownership", coInvestors: "Co-investors",
  exitValue: "Exit or current value", returnMultiple: "Return", lessons: "Lessons",
};

const clean = (v: unknown) => plainPunctuation(String(v ?? "").trim());

/**
 * Turns an extraction into pending suggestions, skipping anything already on
 * record or already suggested. `onlyCompanyId` limits it to one portfolio company
 * (a file attached to that company, or its web research).
 */
export async function recordSuggestions(x: Extracted, source: { label: string; fileId?: string | null; onlyCompanyId?: string | null }): Promise<number> {
  let made = 0;
  const [companies, principles, settings, pending, past] = await Promise.all([
    db.portfolioCompany.findMany(),
    db.investmentPrinciple.findMany({ select: { title: true, body: true } }),
    db.firmSetting.findMany({ where: { key: { in: SETTING_KEYS } } }),
    db.knowledgeSuggestion.findMany({ where: { status: "PENDING" } }),
    db.historicalDeal.findMany({ select: { companyName: true, decisionYear: true } }),
  ]);
  const create = async (kind: string, title: string, data: Record<string, unknown>, targetId?: string | null) => {
    await db.knowledgeSuggestion.create({
      data: { kind, title, data: data as Prisma.InputJsonValue, targetId: targetId ?? null, sourceLabel: source.label, sourceFileId: source.fileId ?? null },
    });
    made++;
  };

  // Portfolio companies
  const only = source.onlyCompanyId ? companies.find((c) => c.id === source.onlyCompanyId) : null;
  for (const raw of x.portfolioCompanies) {
    const name = clean(raw.name);
    if (!name) continue;
    const domain = cleanDomain(raw.website);
    const match =
      only ??
      companies.find((c) => (domain && cleanDomain(c.website) === domain) || (coreName(c.name).length >= 3 && coreName(c.name) === coreName(name)));
    if (only && coreName(only.name) !== coreName(name) && !(domain && cleanDomain(only.website) === domain) && x.portfolioCompanies.length > 1) continue;
    if (match) {
      const changes: Record<string, string> = {};
      for (const k of COMPANY_FIELDS) {
        const v = clean(raw[k]);
        if (!v || (k === "outcome" && v === "UNKNOWN")) continue;
        const current = String((match as Record<string, unknown>)[k] ?? "").trim();
        const value = k === "yearInvested" ? v.replace(/[^\d]/g, "").slice(0, 4) : k === "website" ? (domain ? `https://${domain}` : "") : v;
        if (!value) continue;
        if (!current || (UPDATABLE.includes(k) && current.toLowerCase() !== value.toLowerCase())) changes[k] = value;
      }
      if (!Object.keys(changes).length) continue;
      const open = pending.find((p) => p.kind === "PORTFOLIO_UPDATE" && p.targetId === match.id);
      if (open) {
        // One open suggestion per company: merge rather than pile up duplicates.
        await db.knowledgeSuggestion.update({ where: { id: open.id }, data: { data: { ...(open.data as object), ...changes } as Prisma.InputJsonValue } });
        continue;
      }
      await create("PORTFOLIO_UPDATE", `Add details to ${match.name}`, changes, match.id);
    } else if (!only) {
      if (pending.some((p) => p.kind === "PORTFOLIO_NEW" && coreName(String((p.data as { name?: string }).name ?? "")) === coreName(name))) continue;
      const data: Record<string, string> = { name };
      for (const k of COMPANY_FIELDS) {
        const v = clean(raw[k]);
        if (v && !(k === "outcome" && v === "UNKNOWN")) data[k] = k === "website" ? (domain ? `https://${domain}` : "") : k === "yearInvested" ? v.replace(/[^\d]/g, "").slice(0, 4) : v;
      }
      await create("PORTFOLIO_NEW", `Add ${name} to the portfolio`, data);
    }
  }
  if (source.onlyCompanyId) return made;

  // Principles: skip anything that reads like one already on record or suggested.
  const seen = new Set([...principles.map((p) => coreName(p.title)), ...pending.filter((p) => p.kind === "PRINCIPLE").map((p) => coreName(p.title))]);
  for (const p of x.principles) {
    const title = clean(p.title);
    const body = clean(p.body);
    if (!title || !body || seen.has(coreName(title))) continue;
    seen.add(coreName(title));
    await create("PRINCIPLE", title, { title, body });
  }

  // Firm settings: only where the document says something different from what is saved.
  for (const st of x.settings) {
    const value = clean(st.value);
    const def = FIRM_SETTINGS.find((f) => f.key === st.key);
    if (!value || !def) continue;
    const saved = settings.find((s) => s.key === st.key)?.value?.trim();
    if (saved && saved.toLowerCase() === value.toLowerCase()) continue;
    const open = pending.find((p) => p.kind === "SETTING" && p.targetId === st.key);
    if (open) await db.knowledgeSuggestion.update({ where: { id: open.id }, data: { data: { value } } });
    else await create("SETTING", def.label, { value }, st.key);
  }

  // Past decisions not already in the archive.
  for (const d of x.pastDeals) {
    const companyName = clean(d.companyName);
    if (!companyName || !clean(d.rationale)) continue;
    const year = Number(clean(d.year).slice(0, 4)) || null;
    if (past.some((h) => coreName(h.companyName) === coreName(companyName) && (!year || !h.decisionYear || h.decisionYear === year))) continue;
    if (pending.some((p) => p.kind === "PAST_DEAL" && coreName(p.title) === coreName(companyName))) continue;
    await create("PAST_DEAL", companyName, { companyName, year, decision: d.decision, rationale: clean(d.rationale), outcome: d.outcome, sector: clean(d.sector) });
  }
  return made;
}

export type Applied = { text: string; entity: string; entityId: string; before?: unknown; created?: boolean };
const snap = (r: unknown) => (r == null ? null : JSON.parse(JSON.stringify(r)));

/** Writes an accepted suggestion into the knowledge base. Returns what changed, with enough to undo it. */
export async function applySuggestion(id: string, edited?: Record<string, string>): Promise<Applied> {
  const s = await db.knowledgeSuggestion.findUnique({ where: { id } });
  if (!s || s.status !== "PENDING") throw new Error("This suggestion has already been handled.");
  const data = { ...(s.data as Record<string, unknown>), ...(edited ?? {}) } as Record<string, string | number | null>;
  const str = (k: string) => (data[k] == null || data[k] === "" ? undefined : String(data[k]).trim());
  const companyData = () => ({
    website: str("website"), sector: str("sector"), modality: str("modality"), indication: str("indication"), description: str("description"),
    yearInvested: str("yearInvested") ? Number(str("yearInvested")) || undefined : undefined, stageAtEntry: str("stageAtEntry"),
    outcome: (OUTCOMES as readonly string[]).includes(String(data.outcome)) ? (data.outcome as PortfolioOutcome) : undefined,
    outcomeNotes: str("outcomeNotes"), checkSize: str("checkSize"), roundSize: str("roundSize"), entryValuation: str("entryValuation"),
    ownership: str("ownership"), coInvestors: str("coInvestors"), exitValue: str("exitValue"), returnMultiple: str("returnMultiple"), lessons: str("lessons"),
  });
  switch (s.kind) {
    case "PORTFOLIO_NEW": {
      const name = str("name");
      if (!name) throw new Error("A company name is needed.");
      const c = await db.portfolioCompany.create({ data: { ...companyData(), name, sector: str("sector") ?? "Therapeutics", description: str("description") ?? `${name}.`, verified: false } });
      return { text: `Added ${name} to the portfolio`, entity: "PortfolioCompany", entityId: c.id, created: true };
    }
    case "PORTFOLIO_UPDATE": {
      const before = await db.portfolioCompany.findUnique({ where: { id: s.targetId! } });
      const c = await db.portfolioCompany.update({ where: { id: s.targetId! }, data: { ...companyData(), seeded: false } });
      return { text: `Updated ${c.name}`, entity: "PortfolioCompany", entityId: c.id, before: snap(before) };
    }
    case "PRINCIPLE":
      const p = await db.investmentPrinciple.create({ data: { title: str("title") ?? s.title, body: str("body") ?? "" } });
      return { text: `Added the principle "${s.title}"`, entity: "InvestmentPrinciple", entityId: p.id, created: true };
    case "SETTING": {
      const before = await db.firmSetting.findUnique({ where: { key: s.targetId! } });
      await db.firmSetting.upsert({ where: { key: s.targetId! }, create: { key: s.targetId!, value: str("value") ?? "" }, update: { value: str("value") ?? "" } });
      return { text: `Set ${s.title}`, entity: "FirmSetting", entityId: s.targetId!, before: before ? { value: before.value } : null };
    }
    case "PAST_DEAL": {
      const decision = (DECISIONS as readonly string[]).includes(String(data.decision)) ? (data.decision as (typeof DECISIONS)[number]) : "PASSED_AT_SCREENING";
      const h = await db.historicalDeal.create({
        data: {
          companyName: str("companyName") ?? s.title, decision, decisionRationale: str("rationale") ?? "(rationale not recorded)",
          decisionYear: Number(data.year) || null, outcome: (OUTCOMES as readonly string[]).includes(String(data.outcome)) ? (data.outcome as PortfolioOutcome) : "UNKNOWN",
          sector: str("sector"),
        },
      });
      return { text: `Added ${s.title} to past deals`, entity: "HistoricalDeal", entityId: h.id, created: true };
    }
  }
  throw new Error("Unknown suggestion.");
}

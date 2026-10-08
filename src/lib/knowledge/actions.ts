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

// ─── Suggestions from documents and the web ─────────────────────────────────

/** Accepts one suggestion (optionally with the partner's edits) and records it in the change log. */
export async function acceptSuggestionAction(id: string, edited?: Record<string, string>): Promise<UploadState> {
  const user = await requireRole("PARTNER");
  try {
    const { applySuggestion } = await import("./suggest");
    const s = await db.knowledgeSuggestion.findUnique({ where: { id } });
    const applied = await applySuggestion(id, edited);
    await db.knowledgeSuggestion.update({ where: { id }, data: { status: "ACCEPTED", resolvedAt: new Date(), resolvedById: user.id } });
    // Recorded against the record it changed, with what was there before, so it can be undone.
    await audit("knowledge.suggestion_accepted", {
      userId: user.id,
      entity: applied.entity,
      entityId: applied.entityId,
      meta: { name: applied.text, source: s?.sourceLabel, created: !!applied.created, ...(applied.before !== undefined ? { before: applied.before as never } : {}) },
    });
    if (s?.kind === "PAST_DEAL") after(() => withMeter({ purpose: "past-deal reading" }, () => ingestHistoricalDeal(applied.entityId)));
    const what = applied.text;
    revalidatePath("/knowledge");
    revalidatePath("/training", "layout");
    return { ok: true, message: what };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function dismissSuggestionAction(id: string) {
  const user = await requireRole("PARTNER");
  await db.knowledgeSuggestion.update({ where: { id }, data: { status: "DISMISSED", resolvedAt: new Date(), resolvedById: user.id } });
  revalidatePath("/knowledge");
}

/** Accepts every pending suggestion as GAIA proposed it. */
export async function acceptAllSuggestionsAction(): Promise<UploadState> {
  await requireRole("PARTNER");
  const pending = await db.knowledgeSuggestion.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  let done = 0;
  const problems: string[] = [];
  for (const p of pending) {
    const r = await acceptSuggestionAction(p.id);
    if (r.ok) done++;
    else if (r.error) problems.push(r.error);
  }
  return problems.length ? { ok: false, error: `${done} added; ${problems.length} couldn't be: ${problems[0]}` } : { ok: true, message: `${done} suggestion${done === 1 ? "" : "s"} added.` };
}

/** Looks a portfolio company up online and suggests the details the record is missing. */
export async function fillFromWebAction(companyId: string): Promise<UploadState> {
  await requireRole("PARTNER");
  const c = await db.portfolioCompany.findUnique({ where: { id: companyId } });
  if (!c) return { ok: false, error: "Company not found." };
  const { webResearch } = await import("../ai/analyst");
  const { extractKnowledge, recordSuggestions } = await import("./suggest");
  const n = await withMeter({ purpose: "knowledge from the web" }, async () => {
    const text = await webResearch(
      "knowledge: web",
      `Find public information about the company "${c.name}"${c.website ? ` (${c.website})` : ""}, a Genesys Capital portfolio company${c.sector ? ` in ${c.sector}` : ""}. Report, with a source URL for each fact: its website, what it does, modality and lead indication, funding rounds with amounts, dates and investors (including when Genesys Capital invested), its current status (operating, acquired, IPO, merged or closed) and any exit value or latest valuation. Say plainly what you cannot find.`,
      [],
      { search: 6, fetch: 3 },
    );
    if (!text) return 0;
    const found = await extractKnowledge(
      [{ type: "text", text: `## Web research on ${c.name}\n\n${text}` }],
      `This is web research about ${c.name}, a company Genesys Capital has invested in. Report only ${c.name} in portfolioCompanies, and leave the other lists empty.`,
    );
    return found ? recordSuggestions(found, { label: `web research on ${c.name}`, onlyCompanyId: c.id }) : 0;
  });
  revalidatePath("/knowledge");
  return n ? { ok: true, message: "Found new details online. Review them in Suggestions at the top of the page." } : { ok: true, message: "Nothing new found online for this company." };
}

// ─── Batch import from the CSV / Excel templates ────────────────────────────

/** Imports portfolio companies or principles from a filled-in template. Existing companies are updated, not duplicated. */
export async function importTableAction(kind: "portfolio" | "principles", _: UploadState, fd: FormData): Promise<UploadState> {
  const user = await requireRole("PARTNER");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose the filled-in CSV or Excel file." };
  const { readTable, headerKeys, TEMPLATES } = await import("./templates");
  const { coreName } = await import("../deals/portfolio");
  let rows: string[][];
  try {
    rows = await readTable(file);
  } catch {
    return { ok: false, error: "That file couldn't be read. Save it as .xlsx or .csv and try again." };
  }
  const t = TEMPLATES[kind];
  if (rows.length < 2) return { ok: false, error: "The file has no rows below the header." };
  const keys = headerKeys(rows[0], t);
  const get = (r: string[], k: string) => {
    const i = keys.indexOf(k);
    const v = i >= 0 ? (r[i] ?? "").trim() : "";
    return v || undefined;
  };
  const isExample = (r: string[]) => t.columns.every((c, i) => !c.example || (r[keys.indexOf(c.key)] ?? "").trim() === c.example || i > 2);
  let created = 0, updated = 0;
  const skipped: string[] = [];

  if (kind === "principles") {
    const existing = new Set((await db.investmentPrinciple.findMany({ select: { title: true } })).map((p) => coreName(p.title)));
    for (const [n, r] of rows.slice(1).entries()) {
      const title = get(r, "title"), body = get(r, "principle");
      if (!title || !body) { skipped.push(`row ${n + 2}: needs a title and the principle`); continue; }
      if (title === t.columns[0].example) continue;
      if (existing.has(coreName(title))) { skipped.push(`row ${n + 2}: "${title}" is already a principle`); continue; }
      await db.investmentPrinciple.create({ data: { title: title.slice(0, 200), body: body.slice(0, 3000) } });
      existing.add(coreName(title));
      created++;
    }
  } else {
    const OUT: Record<string, string> = { active: "ACTIVE", acquired: "ACQUIRED", ipo: "IPO", merged: "MERGED", "wound down": "WOUND_DOWN", wound_down: "WOUND_DOWN", closed: "WOUND_DOWN", unknown: "UNKNOWN" };
    const companies = await db.portfolioCompany.findMany();
    for (const [n, r] of rows.slice(1).entries()) {
      const name = get(r, "name");
      if (!name) { skipped.push(`row ${n + 2}: no company name`); continue; }
      if (isExample(r) && name === t.columns[0].example) continue;
      const year = Number(get(r, "year_invested"));
      const outcome = OUT[(get(r, "outcome") ?? "").toLowerCase()];
      const data = {
        website: get(r, "website"), sector: get(r, "sector"), modality: get(r, "modality"), indication: get(r, "indication"),
        description: get(r, "description"), yearInvested: year > 1980 && year < 2100 ? year : undefined, stageAtEntry: get(r, "stage_at_entry"),
        outcome: outcome as never, outcomeNotes: get(r, "outcome_notes"), checkSize: get(r, "genesys_investment"), roundSize: get(r, "round_size"),
        entryValuation: get(r, "entry_valuation"), ownership: get(r, "ownership"), coInvestors: get(r, "co_investors"), exitValue: get(r, "exit_value"),
        returnMultiple: get(r, "return"), lessons: get(r, "lessons"),
      };
      const match = companies.find((c) => coreName(c.name) === coreName(name));
      if (match) {
        await db.portfolioCompany.update({ where: { id: match.id }, data: { ...data, seeded: false } });
        updated++;
      } else {
        const c = await db.portfolioCompany.create({ data: { ...data, name, sector: data.sector ?? "Therapeutics", description: data.description ?? `${name}.`, verified: true } });
        companies.push(c);
        created++;
      }
    }
  }
  await audit("knowledge.imported", { userId: user.id, meta: { name: `${t.title} import (${file.name})`, changes: [{ field: t.title, from: "", to: `${created} added, ${updated} updated` }] } });
  revalidatePath("/knowledge");
  const summary = `${created} added${updated ? `, ${updated} updated` : ""}.`;
  return skipped.length ? { ok: created + updated > 0, message: `${summary} Skipped ${skipped.length}: ${skipped.slice(0, 3).join("; ")}${skipped.length > 3 ? "…" : ""}`, error: created + updated ? undefined : `Nothing imported. ${skipped.slice(0, 3).join("; ")}` } : { ok: true, message: summary };
}

/** Re-reads every firm document and suggests firm settings, principles and portfolio details from them. */
export async function draftFromDocumentsAction(): Promise<UploadState> {
  await requireRole("PARTNER");
  const docs = await db.knowledgeFile.findMany({ where: { scope: "FIRM", status: "READY" }, select: { filename: true, extractedText: true, summary: true }, orderBy: { createdAt: "desc" } });
  if (!docs.length) return { ok: false, error: "Upload firm documents first (fund strategy, LP reports, IC memos). GAIA drafts from those." };
  let budget = 250_000;
  const text = docs
    .map((d) => {
      const body = (d.extractedText ?? d.summary ?? "").slice(0, Math.max(0, budget));
      budget -= body.length;
      return body ? `## ${d.filename}\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  const { extractKnowledge, recordSuggestions } = await import("./suggest");
  const n = await withMeter({ purpose: "knowledge extraction" }, async () => {
    const found = await extractKnowledge(
      [{ type: "text", text }],
      "These are Genesys Capital's own documents. Focus on the firm settings (cheque size, ownership, reserves, return hurdle, mandate, screening bar, writing voice) and the investment principles they state, plus any portfolio companies.",
    );
    return found ? recordSuggestions(found, { label: `your ${docs.length} firm document${docs.length === 1 ? "" : "s"}` }) : 0;
  });
  revalidatePath("/knowledge");
  revalidatePath("/training/prompt");
  return n ? { ok: true, message: `${n} suggestion${n === 1 ? "" : "s"} drafted. Review them at the top of the Knowledge base.` } : { ok: true, message: "Nothing new found in the documents." };
}

// ─── Undo ───────────────────────────────────────────────────────────────────

type Snap = Record<string, unknown>;
/** A stored record without the columns that can't or shouldn't be written back. */
const restorable = (r: Snap) => {
  const { id, createdAt, updatedAt, ...rest } = r;
  void id; void createdAt; void updatedAt;
  return rest;
};

/** Changes that can be undone: edits, removals and additions in the knowledge base. */
export async function undoChangeAction(auditId: string): Promise<UploadState> {
  const user = await requireRole("PARTNER");
  const log = await db.auditLog.findUnique({ where: { id: auditId } });
  if (!log?.entityId) return { ok: false, error: "That change can't be undone." };
  const meta = (log.meta ?? {}) as { name?: string; before?: Snap | null; created?: boolean; undone?: boolean };
  if (meta.undone) return { ok: false, error: "That change was already undone." };
  const id = log.entityId;
  const created = log.action.endsWith(".created") || meta.created === true;
  try {
    switch (log.entity) {
      case "PortfolioCompany":
        if (created) await db.portfolioCompany.delete({ where: { id } });
        else if (meta.before && log.action.endsWith(".deleted")) await db.portfolioCompany.create({ data: { ...(restorable(meta.before) as Snap), id } as never });
        else if (meta.before) await db.portfolioCompany.update({ where: { id }, data: restorable(meta.before) as never });
        else return { ok: false, error: "This change was made before undo was available." };
        break;
      case "InvestmentPrinciple":
        if (created) await db.investmentPrinciple.delete({ where: { id } });
        else if (meta.before && log.action.endsWith(".deleted")) await db.investmentPrinciple.create({ data: { ...(restorable(meta.before) as Snap), id } as never });
        else if (meta.before) await db.investmentPrinciple.update({ where: { id }, data: restorable(meta.before) as never });
        else return { ok: false, error: "This change was made before undo was available." };
        break;
      case "FirmSetting":
        if (meta.before && typeof meta.before.value === "string") await db.firmSetting.update({ where: { key: id }, data: { value: meta.before.value } });
        else await db.firmSetting.delete({ where: { key: id } });
        break;
      case "FundingStage":
        if (created) await db.fundingStage.delete({ where: { id } });
        else if (meta.before && log.action.endsWith(".deleted")) await db.fundingStage.create({ data: { ...(restorable(meta.before) as Snap), id } as never });
        else if (meta.before) await db.fundingStage.update({ where: { id }, data: restorable(meta.before) as never });
        else return { ok: false, error: "This change was made before undo was available." };
        break;
      case "HistoricalDeal":
        if (created) await db.historicalDeal.delete({ where: { id } });
        else return { ok: false, error: "That change can't be undone." };
        break;
      default:
        return { ok: false, error: "That change can't be undone." };
    }
  } catch {
    return { ok: false, error: "It has changed again since, or no longer exists, so it can't be undone automatically." };
  }
  await db.auditLog.update({ where: { id: auditId }, data: { meta: { ...(meta as object), undone: true } as never } });
  await audit("knowledge.undone", { userId: user.id, entity: log.entity ?? undefined, entityId: id, meta: { name: `Undid: ${meta.name ?? log.action}` } });
  revalidatePath("/knowledge");
  revalidatePath("/training", "layout");
  return { ok: true, message: "Undone." };
}

/** "Tell GAIA": a note in plain English, turned into suggestions attributed to whoever wrote it. */
export async function noteToKnowledgeAction(_: UploadState, fd: FormData): Promise<UploadState> {
  const user = await requireRole("PARTNER");
  const text = String(fd.get("note") ?? "").trim().slice(0, 30_000);
  if (text.length < 15) return { ok: false, error: "Write a little more: what happened, which company, which numbers." };
  const who = user.name ?? user.email.split("@")[0];
  const { extractKnowledge, recordSuggestions } = await import("./suggest");
  const n = await withMeter({ purpose: "knowledge extraction" }, async () => {
    const found = await extractKnowledge(
      [{ type: "text", text: `## Note from ${who}, a member of the Genesys Capital team\n\n${text}` }],
      "This is a note from a Genesys team member. 'We' means Genesys Capital.",
    );
    return found ? recordSuggestions(found, { label: `a note from ${who}` }) : 0;
  });
  await audit("knowledge.note_added", { userId: user.id, meta: { name: `Note: ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}` } });
  revalidatePath("/knowledge");
  return n
    ? { ok: true, message: `GAIA found ${n} thing${n === 1 ? "" : "s"} to add. Review ${n === 1 ? "it" : "them"} in Suggestions above.` }
    : { ok: true, message: "Thanks. GAIA didn't find a specific company, principle or setting to update in that note." };
}

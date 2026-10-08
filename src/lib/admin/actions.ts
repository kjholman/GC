"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PortfolioOutcome } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { diffFields } from "../changes";

const PORTFOLIO_LABELS = {
  name: "Company", sector: "Sector", modality: "Modality", indication: "Indication", description: "Description",
  yearInvested: "Year invested", stageAtEntry: "Entry stage", outcome: "Outcome", outcomeNotes: "Outcome detail",
  lessons: "Lessons", website: "Website", verified: "Verified",
  checkSize: "Genesys investment", roundSize: "Round size at entry", entryValuation: "Valuation at entry", ownership: "Ownership", coInvestors: "Co-investors", exitValue: "Exit or current value", returnMultiple: "Return",
};
import { requireRole } from "../auth/session";
import { headers } from "next/headers";
import { isAllowedDomain, normalizeEmail } from "../env";
import { generateSessionToken, hashToken } from "../auth/crypto";
import { checkCredit } from "../ai/credit";
import { resumePausedAnalyses } from "../deals/actions";
import { roleForEmail } from "../team";

export type AdminState = { ok: boolean; error?: string; message?: string };

export async function addUsersAction(_: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireRole("ADMIN");
  const raw = String(formData.get("emails") ?? "");
  const emails = [...new Set(raw.split(/[\s,;]+/).map(normalizeEmail).filter(Boolean))];
  if (!emails.length) return { ok: false, error: "Enter at least one email address." };

  const invalid = emails.filter((e) => !z.string().email().safeParse(e).success || !isAllowedDomain(e));
  if (invalid.length) {
    return { ok: false, error: `Only Genesys Capital addresses can be added: ${invalid.join(", ")}` };
  }
  for (const email of emails) {
    await db.user.upsert({ where: { email }, create: { email, role: roleForEmail(email) }, update: { active: true } });
  }
  await audit("admin.users_added", { userId: admin.id, meta: { emails } });
  revalidatePath("/administration");
  return { ok: true, message: `Done. ${emails.length === 1 ? "They now have" : `${emails.length} people now have`} access.` };
}

export async function updateUserAction(userId: string, formData: FormData) {
  const admin = await requireRole("ADMIN");
  const name = formData.get("name");
  const title = formData.get("title");
  await db.user.update({
    where: { id: userId },
    data: {
      ...(typeof name === "string" ? { name: name.trim() || null } : {}),
      ...(typeof title === "string" ? { title: title.trim() || null } : {}),
    },
  });
  await audit("admin.user_updated", { userId: admin.id, entity: "User", entityId: userId, meta: {} });
  revalidatePath("/administration");
}

export async function setUserActiveAction(userId: string, active: boolean) {
  const admin = await requireRole("ADMIN");
  if (userId === admin.id) return;
  await db.user.update({ where: { id: userId }, data: { active } });
  if (!active) {
    await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await audit(active ? "admin.user_reactivated" : "admin.user_revoked", { userId: admin.id, entity: "User", entityId: userId });
  revalidatePath("/administration");
}

const OUTCOMES: PortfolioOutcome[] = ["ACTIVE", "IPO", "ACQUIRED", "MERGED", "WOUND_DOWN", "UNKNOWN"];

const PortfolioInput = z.object({
  name: z.string().trim().min(1).max(200),
  sector: z.string().trim().min(1).max(100),
  modality: z.string().trim().max(200).optional(),
  indication: z.string().trim().max(200).optional(),
  description: z.string().trim().min(1).max(3000),
  yearInvested: z.coerce.number().int().min(1990).max(2100).optional(),
  stageAtEntry: z.string().trim().max(100).optional(),
  outcome: z.enum(OUTCOMES as [PortfolioOutcome, ...PortfolioOutcome[]]),
  outcomeNotes: z.string().trim().max(2000).optional(),
  lessons: z.string().trim().max(3000).optional(),
  website: z.string().trim().max(300).optional(),
  checkSize: z.string().trim().max(500).optional(),
  roundSize: z.string().trim().max(500).optional(),
  entryValuation: z.string().trim().max(500).optional(),
  ownership: z.string().trim().max(500).optional(),
  coInvestors: z.string().trim().max(500).optional(),
  exitValue: z.string().trim().max(500).optional(),
  returnMultiple: z.string().trim().max(500).optional(),
  verified: z.boolean(),
});

export async function savePortfolioCompanyAction(id: string | null, _: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireRole("PARTNER");
  const val = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() ? v : undefined;
  };
  const parsed = PortfolioInput.safeParse({
    name: val("name"),
    sector: val("sector"),
    modality: val("modality"),
    indication: val("indication"),
    description: val("description"),
    yearInvested: val("yearInvested"),
    stageAtEntry: val("stageAtEntry"),
    outcome: val("outcome") ?? "UNKNOWN",
    outcomeNotes: val("outcomeNotes"),
    lessons: val("lessons"),
    website: val("website"),
    checkSize: val("checkSize"),
    roundSize: val("roundSize"),
    entryValuation: val("entryValuation"),
    ownership: val("ownership"),
    coInvestors: val("coInvestors"),
    exitValue: val("exitValue"),
    returnMultiple: val("returnMultiple"),
    verified: formData.get("verified") === "on",
  });
  if (!parsed.success) return { ok: false, error: "Name, sector and description are required." };
  // A partner edit takes the record out of seed maintenance.
  const data = { ...parsed.data, seeded: false };
  const before = id ? await db.portfolioCompany.findUnique({ where: { id } }) : null;
  const saved = id
    ? await db.portfolioCompany.update({ where: { id }, data })
    : await db.portfolioCompany.create({ data });
  const changes = diffFields(before, saved, PORTFOLIO_LABELS);
  await audit(id ? "portfolio.updated" : "portfolio.created", { userId: user.id, entity: "PortfolioCompany", entityId: saved.id, meta: { name: saved.name, changes } });
  revalidatePath("/knowledge");
  return { ok: true, message: "Saved." };
}

export async function deletePortfolioCompanyAction(id: string) {
  const user = await requireRole("PARTNER");
  const removed = await db.portfolioCompany.delete({ where: { id } });
  await audit("portfolio.deleted", { userId: user.id, entity: "PortfolioCompany", entityId: id, meta: { name: removed.name, changes: diffFields(removed, {}, PORTFOLIO_LABELS).map((c) => ({ ...c, to: "(removed)" })) } });
  revalidatePath("/knowledge");
}

export async function savePrincipleAction(id: string | null, _: AdminState, formData: FormData): Promise<AdminState> {
  const user = await requireRole("PARTNER");
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 3000);
  if (!title || !body) return { ok: false, error: "Add a title and the principle itself." };
  const before = id ? await db.investmentPrinciple.findUnique({ where: { id } }) : null;
  const saved = id
    ? await db.investmentPrinciple.update({ where: { id }, data: { title, body } })
    : await db.investmentPrinciple.create({ data: { title, body } });
  await audit(id ? "principle.updated" : "principle.created", {
    userId: user.id, entity: "InvestmentPrinciple", entityId: saved.id,
    meta: { name: saved.title, changes: diffFields(before, saved, { title: "Title", body: "Principle" }) },
  });
  revalidatePath("/knowledge");
  return { ok: true, message: "Principle saved. It applies to every analysis from now on." };
}

export async function deletePrincipleAction(id: string) {
  const user = await requireRole("PARTNER");
  const p = await db.investmentPrinciple.delete({ where: { id } });
  await audit("principle.deleted", { userId: user.id, entity: "InvestmentPrinciple", entityId: id, meta: { name: p.title, changes: [{ field: "Principle", from: p.body, to: "(removed)" }] } });
  revalidatePath("/knowledge");
}

export async function togglePrincipleAction(id: string, active: boolean) {
  const user = await requireRole("PARTNER");
  const p = await db.investmentPrinciple.update({ where: { id }, data: { active } });
  await audit("principle.toggled", { userId: user.id, entity: "InvestmentPrinciple", entityId: id, meta: { active, name: p.title } });
  revalidatePath("/knowledge");
}

const LINK_TTL_HOURS = 24;

/** Issues a single-use sign-in link for a user, to share by any channel. */
export async function createSignInLinkAction(userId: string): Promise<{ ok: boolean; url?: string; expires?: string; error?: string }> {
  const admin = await requireRole("ADMIN");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.active) return { ok: false, error: "User is not active." };
  // Only one live link per user at a time.
  await db.signInLink.updateMany({ where: { userId, usedAt: null, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date() } });
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + LINK_TTL_HOURS * 3600 * 1000);
  await db.signInLink.create({ data: { userId, tokenHash: hashToken(token), expiresAt, createdById: admin.id } });
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  await audit("admin.sign_in_link_created", { userId: admin.id, entity: "User", entityId: userId });
  return {
    ok: true,
    url: `${proto}://${host}/login/link?token=${token}`,
    expires: expiresAt.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" }),
  };
}

export async function checkCreditAction(): Promise<{ ok: boolean; message: string }> {
  const user = await requireRole("ADMIN");
  const result = await checkCredit();
  let message = result.message;
  if (result.ok) {
    const resumed = await resumePausedAnalyses();
    if (resumed) message += ` Resumed ${resumed} paused analys${resumed === 1 ? "is" : "es"}.`;
  }
  await audit("admin.credit_checked", { userId: user.id, meta: { ok: result.ok } });
  revalidatePath("/administration");
  return { ok: result.ok, message };
}

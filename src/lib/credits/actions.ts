"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "../db";
import { audit } from "../audit";
import { requireRole } from "../auth/session";
import { creditStatus } from "./limits";

export type CreditState = { ok: boolean; error?: string; message?: string };

type Kind = "set_limit" | "add" | "refill" | "cut_off" | "restore" | "remove_limit";

const MAX_USD = 1_000_000;

function amountFrom(fd: FormData): number | null {
  const raw = String(fd.get("amount") ?? "").replace(/[$,\s]|US/gi, "");
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 && n <= MAX_USD ? Math.round(n * 100) / 100 : null;
}

/** Restarts this person's analyses that paused on their allowance, if they can now spend again. */
async function resumeIfAllowed(userId: string) {
  const s = await creditStatus(userId);
  if (!s || s.blocked) return 0;
  const paused = await db.analysis.findMany({ where: { status: "PAUSED", pauseReason: "credit_limit", createdById: userId }, select: { id: true } });
  if (!paused.length) return 0;
  await db.analysis.updateMany({ where: { id: { in: paused.map((p) => p.id) } }, data: { status: "QUEUED", error: null, progress: "Resuming" } });
  after(async () => {
    const { runAnalysis } = await import("../ai/analyst");
    for (const { id } of paused) void runAnalysis(id).catch((err) => console.error("[credits] could not resume analysis", id, err));
  });
  return paused.length;
}

async function change(userId: string, kind: Kind, fd: FormData | null): Promise<CreditState> {
  const admin = await requireRole("ADMIN");
  const before = await creditStatus(userId);
  const person = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!before || !person) return { ok: false, error: "That person no longer exists." };
  if (before.isAdmin) return { ok: false, error: "The administrator's own AI use is never limited." };
  const who = person.name ?? person.email.split("@")[0];
  const note = String(fd?.get("note") ?? "").trim().slice(0, 500) || null;
  const amount = fd && (kind === "set_limit" || kind === "add") ? amountFrom(fd) : null;
  if ((kind === "set_limit" || kind === "add") && amount == null) return { ok: false, error: "Enter an amount in US dollars, for example 50." };

  const now = new Date();
  let data: { creditLimitUsd?: number | null; creditSince?: Date | null; creditCutOff?: boolean } = {};
  let message = "";
  switch (kind) {
    case "set_limit":
      // A first allowance starts counting now; changing an existing one keeps what is already used.
      data = { creditLimitUsd: amount, ...(before.limitUsd == null ? { creditSince: now } : {}) };
      message = `${who}'s allowance is now US$${amount!.toFixed(2)}.`;
      break;
    case "add": {
      const left = (before.limitUsd == null ? 0 : (before.remainingUsd ?? 0)) + amount!;
      data = before.limitUsd == null
        ? { creditLimitUsd: amount, creditSince: now }
        // Already over the allowance (the last request ran past it): the new credit is counted from what is used.
        : { creditLimitUsd: Math.round((Math.max(before.limitUsd, before.usedUsd) + amount!) * 100) / 100 };
      message = `Added US$${amount!.toFixed(2)}. ${who} has US$${left.toFixed(2)} left.`;
      break;
    }
    case "refill":
      if (before.limitUsd == null) return { ok: false, error: "Set an allowance first." };
      data = { creditSince: now };
      message = `Refilled. ${who} has the full US$${before.limitUsd.toFixed(2)} again.`;
      break;
    case "cut_off":
      data = { creditCutOff: true };
      message = `AI work is switched off for ${who}. Anything they have running pauses before its next AI request.`;
      break;
    case "restore":
      data = { creditCutOff: false };
      message = `AI work is switched back on for ${who}.`;
      break;
    case "remove_limit":
      data = { creditLimitUsd: null, creditSince: null };
      message = `${who} no longer has an allowance: their AI use is not limited.`;
      break;
  }
  await db.user.update({ where: { id: userId }, data });
  await db.creditChange.create({
    data: {
      userId,
      byId: admin.id,
      kind,
      amountUsd: amount,
      limitBefore: before.limitUsd,
      limitAfter: "creditLimitUsd" in data ? (data.creditLimitUsd ?? null) : before.limitUsd,
      usedBefore: before.usedUsd,
      note,
    },
  });
  await audit(`admin.credit_${kind}`, { userId: admin.id, entity: "User", entityId: userId, meta: { amountUsd: amount, note } });
  const resumed = await resumeIfAllowed(userId);
  if (resumed) message += ` ${resumed === 1 ? "Their paused analysis is" : `${resumed} paused analyses are`} carrying on.`;
  revalidatePath("/administration/credits");
  revalidatePath(`/administration/credits/${userId}`);
  return { ok: true, message };
}

export async function setAllowanceAction(userId: string, _: CreditState, fd: FormData) { return change(userId, "set_limit", fd); }
export async function addCreditAction(userId: string, _: CreditState, fd: FormData) { return change(userId, "add", fd); }
export async function refillAction(userId: string, _: CreditState, fd: FormData) { return change(userId, "refill", fd); }
export async function cutOffAction(userId: string, _: CreditState, fd: FormData) { return change(userId, "cut_off", fd); }
export async function restoreAction(userId: string, _: CreditState, fd: FormData) { return change(userId, "restore", fd); }
export async function removeLimitAction(userId: string, _: CreditState, fd: FormData) { return change(userId, "remove_limit", fd); }

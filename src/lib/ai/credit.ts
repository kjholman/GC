import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import { env } from "../env";
import { anthropic } from "./client";
import { recordUsage } from "./usage";

/**
 * Tracks whether the Anthropic account behind GAIA has credit.
 * Anthropic does not let apps read the prepaid balance, so the app records
 * when a request is refused for lack of credit and when requests succeed again.
 */

const LOW_SINCE = "ai.credit_low_since";
const LAST_OK = "ai.last_ok_at";
const LAST_CHECK = "ai.last_checked_at";

export const BILLING_URL = "https://platform.claude.com/settings/billing";


export class CreditExhaustedError extends Error {
  constructor() {
    super("The Anthropic account behind GAIA has run out of credit. Add credit, then resume the analysis.");
  }
}

/** True when the API refused a request because the account has no credit left. */
export function isCreditError(err: unknown): boolean {
  if (err instanceof CreditExhaustedError) return true;
  if (!(err instanceof Anthropic.APIError)) return false;
  if (err.status === 402) return true;
  const body = err.error as { error?: { type?: string; message?: string } } | undefined;
  const type = body?.error?.type ?? "";
  const message = `${body?.error?.message ?? ""} ${err.message}`;
  return type === "billing_error" || /credit balance|purchase credits|billing/i.test(message);
}

async function put(key: string, value: string) {
  await db.firmSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function recordCreditProblem() {
  const existing = await db.firmSetting.findUnique({ where: { key: LOW_SINCE } });
  if (!existing?.value) await put(LOW_SINCE, new Date().toISOString());
}

let lastOkWrite = 0;
/** Called after a successful AI request. Cheap: writes at most every few minutes unless clearing a problem. */
export async function recordCreditOk() {
  const now = Date.now();
  const flagged = await db.firmSetting.findUnique({ where: { key: LOW_SINCE } });
  if (!flagged?.value && now - lastOkWrite < 5 * 60 * 1000) return;
  lastOkWrite = now;
  await put(LAST_OK, new Date(now).toISOString());
  if (flagged?.value) await put(LOW_SINCE, "");
}

export type AiStatus = { creditLowSince: Date | null; lastOkAt: Date | null; lastCheckedAt: Date | null };

export async function getAiStatus(): Promise<AiStatus> {
  const rows = await db.firmSetting.findMany({ where: { key: { in: [LOW_SINCE, LAST_OK, LAST_CHECK] } } });
  const get = (k: string) => {
    const v = rows.find((r) => r.key === k)?.value;
    return v ? new Date(v) : null;
  };
  return { creditLowSince: get(LOW_SINCE), lastOkAt: get(LAST_OK), lastCheckedAt: get(LAST_CHECK) };
}

/** Sends the smallest possible request to see whether the account has credit. Costs a fraction of a cent. */
export async function checkCredit(): Promise<{ ok: boolean; message: string }> {
  await put(LAST_CHECK, new Date().toISOString());
  try {
    const res = await anthropic().messages.create({
      model: env.anthropicFastModel,
      max_tokens: 64,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    });
    recordUsage(res.model, res.usage as unknown as Anthropic.Beta.BetaUsage, "credit check");
    await recordCreditOk();
    return { ok: true, message: "The Anthropic account has credit and the AI service is responding." };
  } catch (err) {
    if (isCreditError(err)) {
      await recordCreditProblem();
      return { ok: false, message: "The Anthropic account is out of credit. Add credit, then check again." };
    }
    if (err instanceof Anthropic.APIError && (err.status === 401 || err.status === 403)) {
      return { ok: false, message: "The Anthropic API key was rejected. Ask your developer to check it." };
    }
    return { ok: false, message: "Couldn't reach the AI service just now. Try again in a minute." };
  }
}

let lastAutoCheck = 0;
/**
 * While the account is flagged as out of credit, quietly re-check (at most once a
 * minute, triggered by page loads and the banner) so the warning clears and paused analyses
 * resume on their own once credit is added. Each check costs a fraction of a cent.
 */
export async function recheckCreditIfFlagged(onRestored: () => Promise<unknown>): Promise<void> {
  const status = await getAiStatus();
  if (!status.creditLowSince) return;
  const since = Math.max(lastAutoCheck, status.lastCheckedAt?.getTime() ?? 0);
  if (Date.now() - since < 60 * 1000) return;
  lastAutoCheck = Date.now();
  const result = await checkCredit();
  if (result.ok) await onRestored();
}

/** AI spend measured from every request this app has made (see AiUsage). */
export async function measuredSpend(): Promise<{
  monthUsd: number; allTimeUsd: number; analysesThisMonth: number; perAnalysisUsd: number | null; byPurpose: { purpose: string; usd: number }[];
}> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const [month, all, byPurpose, analyses] = await Promise.all([
    db.aiUsage.aggregate({ where: { createdAt: { gte: start } }, _sum: { usd: true } }),
    db.aiUsage.aggregate({ _sum: { usd: true } }),
    db.aiUsage.groupBy({ by: ["purpose"], where: { createdAt: { gte: start } }, _sum: { usd: true } }),
    db.analysis.aggregate({ where: { createdAt: { gte: start }, status: "COMPLETE", costUsd: { not: null } }, _avg: { costUsd: true }, _count: true }),
  ]);
  return {
    monthUsd: month._sum.usd ?? 0,
    allTimeUsd: all._sum.usd ?? 0,
    analysesThisMonth: analyses._count,
    perAnalysisUsd: analyses._avg.costUsd ?? null,
    byPurpose: byPurpose.map((p) => ({ purpose: p.purpose, usd: p._sum.usd ?? 0 })).sort((a, b) => b.usd - a.usd),
  };
}

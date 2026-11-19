import "server-only";
import { db } from "../db";
import { env } from "../env";
import { currentUserId } from "../ai/usage";

/**
 * Per-person AI credit allowances, set by the administrator (ADMIN_EMAIL).
 *
 * A person with an allowance can spend up to that many US$ of AI credit, counted from
 * when the allowance started (creditSince). A person who is cut off can't use AI at all.
 * People without an allowance are not limited. The administrator is never limited.
 *
 * Spend counts against the person who started the work: the person who started an
 * analysis version (even if it resumes later in the background), or who ran the action.
 * Every request to the AI service is checked first, so once the allowance is used up
 * nothing more is spent; a request already under way finishes, so the last one can
 * take spend slightly past the allowance.
 */

export class CreditLimitError extends Error {
  constructor(
    public readonly userId: string,
    public readonly reason: "cut_off" | "used_up",
    who = "this person",
  ) {
    super(
      reason === "cut_off"
        ? `AI work is switched off for ${who}. The administrator can turn it back on.`
        : `${who === "this person" ? "The" : `${who}'s`} AI credit allowance is used up. The administrator can add more credit.`,
    );
    this.name = "CreditLimitError";
  }
}

export const isCreditLimitError = (err: unknown): err is CreditLimitError => err instanceof CreditLimitError;

export type CreditStatus = {
  userId: string;
  /** No allowance and not cut off (or the administrator). */
  unlimited: boolean;
  isAdmin: boolean;
  cutOff: boolean;
  limitUsd: number | null;
  since: Date | null;
  /** Spent against the current allowance. */
  usedUsd: number;
  /** Left to spend; null when unlimited. */
  remainingUsd: number | null;
  blocked: false | "cut_off" | "used_up";
};

type UserRow = { id: string; email: string; creditLimitUsd: number | null; creditSince: Date | null; creditCutOff: boolean };

async function usedSince(userId: string, since: Date | null): Promise<number> {
  const r = await db.aiUsage.aggregate({ where: { userId, ...(since ? { createdAt: { gte: since } } : {}) }, _sum: { usd: true } });
  return r._sum.usd ?? 0;
}

export function statusFrom(u: UserRow, usedUsd: number): CreditStatus {
  const isAdmin = !!env.adminEmail && u.email.toLowerCase() === env.adminEmail;
  const limit = isAdmin ? null : u.creditLimitUsd;
  const cutOff = !isAdmin && u.creditCutOff;
  const remaining = limit == null ? null : Math.max(0, limit - usedUsd);
  return {
    userId: u.id,
    unlimited: limit == null && !cutOff,
    isAdmin,
    cutOff,
    limitUsd: limit,
    since: u.creditSince,
    usedUsd,
    remainingUsd: remaining,
    blocked: cutOff ? "cut_off" : limit != null && usedUsd >= limit ? "used_up" : false,
  };
}

const SELECT = { id: true, email: true, name: true, creditLimitUsd: true, creditSince: true, creditCutOff: true } as const;

export async function creditStatus(userId: string): Promise<CreditStatus | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: SELECT });
  if (!u) return null;
  const limited = u.creditLimitUsd != null;
  return statusFrom(u, limited ? await usedSince(u.id, u.creditSince) : 0);
}

const displayName = (u: { name: string | null; email: string }) => u.name ?? u.email.split("@")[0];

/** Throws CreditLimitError if `userId` may not use AI now. */
export async function assertCreditFor(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const u = await db.user.findUnique({ where: { id: userId }, select: SELECT });
  if (!u) return;
  const s = statusFrom(u, u.creditLimitUsd != null ? await usedSince(u.id, u.creditSince) : 0);
  if (s.blocked) throw new CreditLimitError(userId, s.blocked, displayName(u));
}

/** Called before every request to the AI service: checks the allowance of whoever the work is for. */
export const assertCredit = () => assertCreditFor(currentUserId());

/** For actions: a plain message if `userId` can't start AI work, else null. */
export async function creditBlock(userId: string): Promise<string | null> {
  try {
    await assertCreditFor(userId);
    return null;
  } catch (err) {
    if (!isCreditLimitError(err)) throw err;
    return err.reason === "cut_off"
      ? "AI work is switched off for your account. Ask the administrator to turn it back on."
      : "Your AI credit allowance is used up. Ask the administrator to add more credit.";
  }
}

/** ADMIN_EMAIL can always sign in: create or reactivate that account. */
export async function ensureAdminAccount() {
  const email = env.adminEmail;
  if (!email) return;
  await db.user.upsert({ where: { email }, create: { email, role: "ADMIN" }, update: { active: true, role: "ADMIN" } });
}

export type PersonCredit = CreditStatus & {
  email: string;
  name: string | null;
  active: boolean;
  spentThisMonthUsd: number;
  spentAllTimeUsd: number;
  spentLast30Usd: number;
};

/** Everyone's allowance and spending, for the administrator's credit page. */
export async function creditOverview(): Promise<PersonCredit[]> {
  const users = await db.user.findMany({ select: { ...SELECT, active: true }, orderBy: [{ active: "desc" }, { email: "asc" }] });
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const d30 = new Date(Date.now() - 30 * 86_400_000);
  const rows = await db.$queryRaw<{ userId: string; all: number; month: number; last30: number }[]>`
    SELECT "userId",
           COALESCE(SUM("usd"), 0)::float AS "all",
           COALESCE(SUM("usd") FILTER (WHERE "createdAt" >= ${monthStart}), 0)::float AS "month",
           COALESCE(SUM("usd") FILTER (WHERE "createdAt" >= ${d30}), 0)::float AS "last30"
    FROM "AiUsage" WHERE "userId" IS NOT NULL GROUP BY "userId"`;
  const by = new Map(rows.map((r) => [r.userId, r]));
  const limited = users.filter((u) => u.creditLimitUsd != null);
  const used = new Map(await Promise.all(limited.map(async (u) => [u.id, await usedSince(u.id, u.creditSince)] as const)));
  return users.map((u) => ({
    ...statusFrom(u, used.get(u.id) ?? 0),
    email: u.email,
    name: u.name,
    active: u.active,
    spentThisMonthUsd: by.get(u.id)?.month ?? 0,
    spentAllTimeUsd: by.get(u.id)?.all ?? 0,
    spentLast30Usd: by.get(u.id)?.last30 ?? 0,
  }));
}

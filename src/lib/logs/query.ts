import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { LEVELS, type LogLevel } from "./capture";

export type LogLine = { id: string; at: string; level: string; source: string; message: string; analysisId: string | null };

export type LogFilter = { level?: LogLevel; source?: string; q?: string; analysisId?: string };

/** Reads ?level=warn&source=analyst&q=text&analysis=… ("level" is the minimum: warn includes errors). */
export function filterFrom(sp: URLSearchParams): LogFilter {
  const level = sp.get("level");
  return {
    level: (LEVELS as readonly string[]).includes(level ?? "") ? (level as LogLevel) : undefined,
    source: sp.get("source")?.trim().toLowerCase() || undefined,
    q: sp.get("q")?.trim().slice(0, 200) || undefined,
    analysisId: sp.get("analysis")?.trim() || undefined,
  };
}

export function whereFor(f: LogFilter): Prisma.AppLogWhereInput {
  return {
    ...(f.level ? { level: { in: LEVELS.slice(LEVELS.indexOf(f.level)) as unknown as string[] } } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.q ? { message: { contains: f.q, mode: "insensitive" as const } } : {}),
    ...(f.analysisId ? { analysisId: f.analysisId } : {}),
  };
}

export function toLine(r: { id: bigint; createdAt: Date; level: string; source: string; message: string; analysisId: string | null }): LogLine {
  return { id: r.id.toString(), at: r.createdAt.toISOString(), level: r.level, source: r.source, message: r.message, analysisId: r.analysisId };
}

export function parseId(v: string | null | undefined): bigint | undefined {
  return v && /^\d{1,19}$/.test(v) ? BigInt(v) : undefined;
}

/** Newest lines before `before` (or the latest), returned oldest first. */
export async function recentLogs(f: LogFilter, limit: number, before?: bigint): Promise<LogLine[]> {
  const rows = await db.appLog.findMany({
    where: { ...whereFor(f), ...(before ? { id: { lt: before } } : {}) },
    orderBy: { id: "desc" },
    take: limit,
  });
  return rows.reverse().map(toLine);
}

/** Lines after `after`, oldest first. */
export async function logsAfter(f: LogFilter, after: bigint, limit: number): Promise<LogLine[]> {
  const rows = await db.appLog.findMany({ where: { ...whereFor(f), id: { gt: after } }, orderBy: { id: "asc" }, take: limit });
  return rows.map(toLine);
}

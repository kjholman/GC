import "server-only";
import { formatWithOptions } from "node:util";
import { db } from "../db";
import { currentAnalysisId } from "../ai/usage";

/**
 * Copies everything the server writes to its console into the AppLog table, so logs
 * survive restarts and can be read live (Administration → Server logs, /api/logs/stream).
 *
 * The console still prints as before. Lines are buffered and written in batches once a
 * second, secrets are masked first, and lines older than LOG_RETENTION_DAYS (default 30)
 * are deleted. A failure to save never throws and never logs itself into a loop.
 */

export const LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LEVELS)[number];

const FLUSH_MS = 1000;
const MAX_BATCH = 500;
const MAX_BUFFER = 5000;
const MAX_MESSAGE = 16_000;
const PRUNE_EVERY_MS = 6 * 3600 * 1000;

type Pending = { createdAt: Date; level: LogLevel; source: string; message: string; analysisId: string | null };

const state = globalThis as unknown as { __gaiaLogCapture?: boolean };

/** Masks API keys, bearer tokens, passwords in connection strings and token parameters. */
export function redact(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]{8,}/g, "sk-ant-[redacted]")
    .replace(/\bre_[A-Za-z0-9_]{16,}/g, "re_[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[redacted]")
    .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+@/gi, "$1[redacted]@")
    .replace(/((?:token|password|secret|api[_-]?key)=)[^&\s"']+/gi, "$1[redacted]");
}

/** "[analyst] Something happened" → source "analyst". */
function sourceOf(message: string): { source: string; message: string } {
  const m = /^\[([\w .:/-]{1,40})\]\s*/.exec(message);
  return m ? { source: m[1].trim().toLowerCase(), message: message.slice(m[0].length) || message } : { source: "app", message };
}

export function installLogCapture() {
  if (state.__gaiaLogCapture) return;
  state.__gaiaLogCapture = true;

  const original = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  let buffer: Pending[] = [];
  let flushing = false;
  let lastFailure = 0;

  const capture = (level: LogLevel, args: unknown[]) => {
    try {
      const text = redact(formatWithOptions({ depth: 4, colors: false }, ...args));
      const { source, message } = sourceOf(text);
      buffer.push({ createdAt: new Date(), level, source, message: message.slice(0, MAX_MESSAGE), analysisId: currentAnalysisId() });
      if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
    } catch {
      // Never let logging break the caller.
    }
  };

  console.debug = (...a: unknown[]) => { original.debug(...a); capture("debug", a); };
  console.info = (...a: unknown[]) => { original.info(...a); capture("info", a); };
  console.log = (...a: unknown[]) => { original.log(...a); capture("info", a); };
  console.warn = (...a: unknown[]) => { original.warn(...a); capture("warn", a); };
  console.error = (...a: unknown[]) => { original.error(...a); capture("error", a); };

  const flush = async () => {
    if (flushing || !buffer.length) return;
    flushing = true;
    const batch = buffer.splice(0, MAX_BATCH);
    try {
      await db.appLog.createMany({ data: batch });
    } catch (err) {
      // Put the lines back (the database may be starting up) and report once a minute, to the real console only.
      buffer = [...batch, ...buffer].slice(-MAX_BUFFER);
      if (Date.now() - lastFailure > 60_000) {
        lastFailure = Date.now();
        original.error("[logs] could not save log lines; will retry", err instanceof Error ? err.message : err);
      }
    } finally {
      flushing = false;
    }
  };
  setInterval(() => void flush(), FLUSH_MS).unref();
  process.on("beforeExit", () => void flush());

  const prune = async () => {
    const days = Math.max(1, Number(process.env.LOG_RETENTION_DAYS ?? 30) || 30);
    await db.appLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } } }).catch(() => {});
  };
  void prune();
  setInterval(() => void prune(), PRUNE_EVERY_MS).unref();
}

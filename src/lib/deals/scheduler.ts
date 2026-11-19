import "server-only";
import { db } from "../db";
import { runAnalysis } from "../ai/analyst";

/** Restarts every analysis that paused for lack of credit. Call from a background context. */
export async function resumeAllPaused(): Promise<number> {
  // Only those paused for GAIA's Anthropic credit; a person's used-up allowance resumes when the administrator adds credit.
  const paused = await db.analysis.findMany({ where: { status: "PAUSED", NOT: { pauseReason: "credit_limit" } }, select: { id: true } });
  for (const { id } of paused) {
    await db.analysis.update({ where: { id }, data: { status: "QUEUED", error: null, progress: "Resuming" } });
    void runAnalysis(id).catch((err) => console.error("[credit] could not resume analysis", id, err));
  }
  return paused.length;
}

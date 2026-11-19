import "server-only";
import { db } from "../db";
import { currentAnalysisId } from "./usage";

/**
 * Work in progress inside one AI request. While a step streams its answer, what it has
 * written so far is saved to the analysis's checkpoint every few seconds. If the server
 * restarts mid-step, the resumed analysis hands that text back to the model and asks it
 * to continue from where it stopped, instead of starting the step again.
 *
 * Saved under `checkpoint.partial[step]` and cleared as soon as the request ends,
 * however it ends, so only a request cut off by a restart leaves anything behind.
 */

const SAVE_EVERY_MS = 5000;
/** Shorter than this, continuing saves too little to be worth the risk of a bad join. */
const MIN_RESUME_CHARS = 400;

export function partialRecorder(step: string, initial = "") {
  const analysisId = currentAnalysisId();
  let text = initial;
  let lastSave = 0;
  let saved = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const save = () => {
    if (!analysisId || text.length === saved) return;
    const snapshot = text;
    saved = snapshot.length;
    queue = queue
      .then(() =>
        db.$executeRaw`UPDATE "Analysis" SET "checkpoint" = COALESCE("checkpoint", '{}'::jsonb) || jsonb_build_object('partial', COALESCE("checkpoint"->'partial', '{}'::jsonb) || jsonb_build_object(${step}::text, jsonb_build_object('text', ${snapshot}::text, 'at', to_jsonb(now())))) WHERE "id" = ${analysisId}`,
      )
      .catch((err) => console.error("[partial] could not save progress", err));
  };
  return {
    add(delta: string) {
      text += delta;
      if (Date.now() - lastSave >= SAVE_EVERY_MS) {
        lastSave = Date.now();
        save();
      }
    },
    /** Called when the request ends: nothing is left to resume. */
    async clear() {
      if (!analysisId) return;
      await queue;
      await db.$executeRaw`UPDATE "Analysis" SET "checkpoint" = "checkpoint" #- ARRAY['partial', ${step}::text] WHERE "id" = ${analysisId} AND "checkpoint" ? 'partial'`.catch(
        (err) => console.error("[partial] could not clear progress", err),
      );
    },
  };
}

/** What this step had written before an interruption, if enough to continue from. */
export async function savedPartial(step: string): Promise<string | null> {
  const analysisId = currentAnalysisId();
  if (!analysisId) return null;
  const rows = await db.$queryRaw<{ text: string | null }[]>`SELECT "checkpoint"->'partial'->${step}::text->>'text' AS text FROM "Analysis" WHERE "id" = ${analysisId}`.catch(() => []);
  const text = rows[0]?.text ?? null;
  return text && text.length >= MIN_RESUME_CHARS ? text : null;
}

/** Adds a line to the analysis's step log saying a step is continuing from saved progress. */
export async function noteResume(step: string, chars: number) {
  const analysisId = currentAnalysisId();
  if (!analysisId) return;
  const entry = JSON.stringify([{ at: new Date().toISOString(), text: `Continuing ${step} from where it stopped (${chars.toLocaleString("en-CA")} characters already written)`, kind: "info" }]);
  await db.$executeRaw`UPDATE "Analysis" SET "steps" = COALESCE("steps", '[]'::jsonb) || ${entry}::jsonb WHERE "id" = ${analysisId}`.catch(() => {});
}

/**
 * The instruction that hands the saved text back. `exact` asks for only the rest of the
 * text (joined on afterwards); otherwise the model rewrites the whole answer, keeping
 * what was already written where it still holds.
 */
export function resumeBlock(prior: string, exact: boolean): string {
  return exact
    ? [
        "## Your previous answer to this request was cut off",
        "Below, between the markers, is everything you had already written. Continue it from exactly the next character: output only the remaining part, with nothing before it and without repeating any of it. The two parts will be joined together as one answer.",
        "<<<ALREADY WRITTEN",
        prior,
        "ALREADY WRITTEN>>>",
      ].join("\n")
    : [
        "## Your previous answer to this request was cut off",
        "Below is what you had already written. Write the complete answer now, keeping that work where it still holds and finishing the rest.",
        "<<<ALREADY WRITTEN",
        prior,
        "ALREADY WRITTEN>>>",
      ].join("\n");
}

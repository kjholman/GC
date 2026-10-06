import "server-only";
import { db } from "../db";
import { structuredCall } from "../ai/client";
import { FeedbackLessonSchema, type Memo } from "../ai/schema";
import { INTERPRET_FEEDBACK_PROMPT } from "../ai/prompts";
import { plainPunctuation } from "../ai/style";
import { FEEDBACK_AREA_LABEL } from "./options";

/** Reads one review against its memo and stores the lesson the Sharminator will apply next time. */
export async function interpretFeedback(feedbackId: string): Promise<void> {
  const f = await db.analysisFeedback.findUnique({
    where: { id: feedbackId },
    include: { analysis: { select: { memo: true, recommendation: true, overallScore: true, deal: { select: { companyName: true, sector: true, modality: true, stage: true } } } } },
  });
  if (!f) return;
  const memo = f.analysis.memo as Memo | null;
  const d = f.analysis.deal;
  const text = [
    INTERPRET_FEEDBACK_PROMPT,
    "",
    `## Deal\n${d.companyName} (${[d.sector, d.modality, d.stage].filter(Boolean).join("; ") || "profile unknown"})`,
    `## Your memo\nRecommendation: ${f.analysis.recommendation} (score ${f.analysis.overallScore}).`,
    memo?.worthOurTime?.headline ? `Headline: ${memo.worthOurTime.headline}` : "",
    memo ? `Full memo:\n\`\`\`json\n${JSON.stringify(memo).slice(0, 60000)}\n\`\`\`` : "",
    "## The reviewer's feedback",
    `Overall: ${f.verdict.replaceAll("_", " ").toLowerCase()}${f.correctedRecommendation ? `; the right call was ${f.correctedRecommendation}` : ""}.`,
    f.areas.length ? `Issues ticked: ${f.areas.map((a) => FEEDBACK_AREA_LABEL[a] ?? a).join("; ")}.` : "No specific issues ticked.",
    `In their words: "${f.comment}"`,
  ].filter(Boolean).join("\n");
  try {
    const { data } = await structuredCall({ schema: FeedbackLessonSchema, effort: "low", maxTokens: 8000, content: [{ type: "text", text }] });
    await db.analysisFeedback.update({
      where: { id: feedbackId },
      data: { lesson: plainPunctuation(data.lesson).slice(0, 1000), appliesTo: plainPunctuation(data.appliesTo).slice(0, 200), interpretedAt: new Date() },
    });
  } catch (err) {
    // Not fatal: the reviewer's own words are still used in every analysis.
    console.error("[feedback] could not interpret review", feedbackId, err);
  }
}

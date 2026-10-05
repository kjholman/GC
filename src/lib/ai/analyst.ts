import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Analysis, Deal, DealStatus, Document, Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { familyOf } from "./extract";
import { MemoSchema, normaliseMemo, type Memo } from "./schema";
import { FIRM_PROFILE, METHODOLOGY, RESEARCH_PROMPT, portfolioBlock, type CalibrationExample } from "./prompts";

type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

/** Requests are capped at 32 MB; base64 adds ~33%, so keep raw binaries under this. */
const BINARY_BUDGET_BYTES = 20 * 1024 * 1024;

// Server-side fallback: if a request is declined by a safety classifier the API
// re-runs it on Anthropic's recommended fallback model inside the same call.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic({ timeout: 20 * 60 * 1000, maxRetries: 3 }));

export const STATUS_FOR_RECOMMENDATION: Record<Memo["recommendation"], DealStatus> = {
  REJECT: "REJECTED",
  PENDING_INFO: "PENDING_INFO",
  ADVANCE_TO_DILIGENCE: "DILIGENCE",
};

async function setProgress(id: string, progress: string) {
  await db.analysis.update({ where: { id }, data: { progress } });
}

/** Convert stored documents into model content blocks, newest round first. */
function documentBlocks(docs: Document[]): { blocks: ContentBlock[]; omitted: string[] } {
  const sorted = [...docs].sort((a, b) => b.round - a.round || b.createdAt.getTime() - a.createdAt.getTime());
  const blocks: ContentBlock[] = [];
  const omitted: string[] = [];
  let binaryBytes = 0;

  for (const doc of sorted) {
    const context = `Submitted in round ${doc.round}${doc.round === 1 ? " (original pitch)" : " (follow-up information)"}; category: ${doc.kind.replaceAll("_", " ").toLowerCase()}.`;
    const family = familyOf(doc.mimeType);

    if (doc.extractedText != null) {
      blocks.push({
        type: "document",
        source: { type: "text", media_type: "text/plain", data: doc.extractedText || "(no extractable text)" },
        title: doc.filename,
        context,
      });
      continue;
    }

    if (binaryBytes + doc.sizeBytes > BINARY_BUDGET_BYTES) {
      omitted.push(doc.filename);
      continue;
    }
    binaryBytes += doc.sizeBytes;
    const data = Buffer.from(doc.data).toString("base64");

    if (family === "pdf") {
      blocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
        title: doc.filename,
        context,
      });
    } else if (family === "image") {
      blocks.push({ type: "text", text: `Image: ${doc.filename}. ${context}` });
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: doc.mimeType as "image/png" | "image/jpeg" | "image/webp", data },
      });
    }
  }
  return { blocks, omitted };
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Stage 1 — live web research on the company, science, competitors and comps. */
async function researchBrief(deal: Deal, docs: ContentBlock[]): Promise<string | null> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: [
        ...docs,
        { type: "text", text: `Company under review: ${deal.companyName}.\n\n${RESEARCH_PROMPT}` },
      ],
    },
  ];

  for (let turn = 0; turn < 6; turn++) {
    const stream = anthropic().beta.messages.stream({
      model: env.anthropicModel,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 12 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8 },
      ],
      messages,
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === "refusal") return null;
    if (response.stop_reason === "pause_turn") {
      // Server-side tool loop hit its iteration limit; resume where it left off.
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    return textOf(response.content).trim() || null;
  }
  return null;
}

function priorAnalysesBlock(prior: Analysis[]): string | null {
  const complete = prior.filter((a) => a.status === "COMPLETE" && a.memo);
  if (!complete.length) return null;
  const latest = complete[complete.length - 1];
  const history = complete
    .map((a) => `- v${a.version} (${a.completedAt?.toISOString().slice(0, 10)}): ${a.recommendation}, score ${a.overallScore}${a.analystContext ? ` — analyst note: "${a.analystContext}"` : ""}`)
    .join("\n");
  return [
    "## Prior analyses of this deal",
    history,
    "",
    `### Most recent memo (v${latest.version}), in full`,
    "```json",
    JSON.stringify(latest.memo),
    "```",
  ].join("\n");
}

/** Stage 2 — the structured investment memo. */
async function writeMemo(args: {
  deal: Deal;
  analysis: Analysis;
  docs: ContentBlock[];
  omitted: string[];
  research: string | null;
  prior: Analysis[];
}): Promise<{ memo: Memo; usage: Anthropic.Beta.BetaUsage; model: string }> {
  const [portfolio, pipeline, principles, feedback] = await Promise.all([
    db.portfolioCompany.findMany({ orderBy: [{ outcome: "asc" }, { name: "asc" }] }),
    db.deal.findMany({
      where: { id: { not: args.deal.id }, latestScore: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 40,
      select: { companyName: true, sector: true, status: true, latestScore: true, recommendation: true },
    }),
    db.investmentPrinciple.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    db.analysisFeedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        user: { select: { role: true } },
        analysis: { select: { recommendation: true, overallScore: true, deal: { select: { companyName: true } } } },
      },
    }),
  ]);
  const calibration: CalibrationExample[] = feedback.map((f) => ({
    companyName: f.analysis.deal.companyName,
    aiRecommendation: f.analysis.recommendation,
    aiScore: f.analysis.overallScore,
    verdict: f.verdict,
    correctedRecommendation: f.correctedRecommendation,
    comment: f.comment,
    reviewerRole: f.user.role,
  }));

  const priorBlock = priorAnalysesBlock(args.prior);
  const isFollowUp = !!priorBlock;

  const task = [
    isFollowUp
      ? `New information has been received for ${args.deal.companyName}. Re-assess the opportunity in light of everything attached (documents from all rounds) and the prior memo below. Produce a complete, updated memo — not a diff — and explain what changed in versionDelta.`
      : `Screen this inbound opportunity${args.deal.companyName ? ` (${args.deal.companyName})` : ""} and produce the investment memo.`,
    args.analysis.analystContext ? `\n## Note from the Genesys team\n${args.analysis.analystContext}` : "",
    args.omitted.length
      ? `\nThe following earlier files were too large to re-attach this round; rely on the prior memo for their content: ${args.omitted.join(", ")}.`
      : "",
    priorBlock ? `\n${priorBlock}` : "",
    args.research
      ? `\n## Independent research brief (live web research, compiled before this memo)\n${args.research}`
      : "\n(No independent web research was available for this analysis; rely on the materials and your own knowledge, flagging anything that needs verification.)",
  ].join("\n");

  const stream = anthropic().beta.messages.stream({
    model: env.anthropicModel,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: env.analysisEffort, format: betaZodOutputFormat(MemoSchema) },
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: [
      { type: "text", text: `${FIRM_PROFILE}\n\n${METHODOLOGY}`, cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: portfolioBlock(portfolio, pipeline, principles, calibration), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: [...args.docs, { type: "text", text: task }] }],
  });

  const response = await stream.finalMessage();
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to analyse these materials. Review the documents and try again.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The memo exceeded the maximum output length. Try re-running the analysis.");
  }
  const parsed = response.parsed_output ?? MemoSchema.parse(JSON.parse(textOf(response.content)));
  return { memo: normaliseMemo(parsed), usage: response.usage, model: response.model };
}

/** Runs one analysis end-to-end. Safe to call from a background task. */
export async function runAnalysis(analysisId: string): Promise<void> {
  const analysis = await db.analysis.findUnique({
    where: { id: analysisId },
    include: { deal: { include: { documents: true } } },
  });
  if (!analysis || analysis.status === "COMPLETE") return;
  const { deal } = analysis;

  await db.analysis.update({
    where: { id: analysisId },
    data: { status: "RUNNING", startedAt: new Date(), progress: "Reading submitted materials", error: null },
  });

  try {
    const prior = await db.analysis.findMany({
      where: { dealId: deal.id, version: { lt: analysis.version } },
      orderBy: { version: "asc" },
    });
    const { blocks, omitted } = documentBlocks(deal.documents);
    if (!blocks.length) throw new Error("No readable documents are attached to this deal.");

    // Re-use earlier research on follow-ups unless none exists yet.
    let research = [...prior].reverse().find((a) => a.research)?.research ?? null;
    if (env.webResearchEnabled && (!research || analysis.trigger === "RERUN")) {
      await setProgress(analysisId, "Researching science, competitors and comparable deals");
      research = await researchBrief(deal, blocks).catch((err) => {
        console.error("[analyst] research stage failed; continuing without it", err);
        return null;
      });
    }

    await setProgress(
      analysisId,
      prior.length ? "Re-underwriting with new information" : "Underwriting: science, financials, fit",
    );
    const { memo, usage, model } = await writeMemo({ deal, analysis, docs: blocks, omitted, research, prior });

    const status = STATUS_FOR_RECOMMENDATION[memo.recommendation];
    await db.$transaction([
      db.analysis.update({
        where: { id: analysisId },
        data: {
          status: "COMPLETE",
          progress: null,
          completedAt: new Date(),
          memo: memo as unknown as Prisma.InputJsonValue,
          research,
          recommendation: memo.recommendation,
          overallScore: memo.overallScore,
          model,
          inputTokens:
            usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
          outputTokens: usage.output_tokens,
        },
      }),
      db.deal.update({
        where: { id: deal.id },
        data: {
          status,
          latestScore: memo.overallScore,
          recommendation: memo.recommendation,
          // Fill descriptive fields the team hasn't set by hand.
          oneLiner: deal.oneLiner ?? memo.company.oneLiner,
          sector: deal.sector ?? memo.company.sector,
          modality: deal.modality ?? memo.company.modality,
          stage: deal.stage ?? memo.company.developmentStage,
          location: deal.location ?? memo.company.headquarters,
          roundSize: deal.roundSize ?? memo.company.roundSought,
          website: deal.website ?? memo.company.website,
          contactName: deal.contactName ?? memo.company.founderContactName,
          contactEmail: deal.contactEmail ?? memo.company.founderContactEmail,
          companyName: deal.companyName.startsWith("Untitled") ? memo.company.name : deal.companyName,
        },
      }),
      db.activity.create({
        data: {
          dealId: deal.id,
          type: "analysis.complete",
          message: `AI analysis v${analysis.version} complete — ${memo.recommendation.replaceAll("_", " ").toLowerCase()} (score ${memo.overallScore}).`,
        },
      }),
    ]);
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `Model API error (${err.status ?? "network"}): ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[analyst] analysis failed", analysisId, err);
    await db.analysis.update({
      where: { id: analysisId },
      data: { status: "FAILED", progress: null, error: message.slice(0, 2000), completedAt: new Date() },
    });
    await db.activity.create({
      data: { dealId: deal.id, type: "analysis.failed", message: `AI analysis v${analysis.version} failed: ${message.slice(0, 300)}` },
    });
  }
}

/** Mark analyses orphaned by a server restart as failed so they can be re-run. */
export async function recoverStaleAnalyses() {
  const cutoff = new Date(Date.now() - 45 * 60 * 1000);
  await db.analysis.updateMany({
    where: { status: { in: ["RUNNING", "QUEUED"] }, createdAt: { lt: cutoff } },
    data: { status: "FAILED", error: "Interrupted by a server restart. Re-run the analysis.", progress: null },
  });
}

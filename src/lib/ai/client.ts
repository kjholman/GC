import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env } from "../env";
import { sanitizeStrings } from "./style";
import { recordCreditOk } from "./credit";

export type ContentBlock = Anthropic.Beta.BetaContentBlockParam;


// Server-side fallback: if a request is declined by a safety classifier the API
// re-runs it on Anthropic's recommended fallback model inside the same call.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
export const anthropic = () => (client ??= new Anthropic({ timeout: 20 * 60 * 1000, maxRetries: 3 }));

export function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** One structured-output call with streaming, refusal fallback and validation. */
export async function structuredCall<S extends z.ZodType>(args: {
  schema: S;
  content: ContentBlock[];
  system?: Anthropic.Beta.BetaTextBlockParam[];
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
}): Promise<{ data: z.infer<S>; usage: Anthropic.Beta.BetaUsage; model: string }> {
  const stream = anthropic().beta.messages.stream({
    model: env.anthropicModel,
    max_tokens: args.maxTokens ?? 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: args.effort, format: betaZodOutputFormat(args.schema) },
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    ...(args.system ? { system: args.system } : {}),
    messages: [{ role: "user", content: args.content }],
  });
  const response = await stream.finalMessage();
  void recordCreditOk().catch(() => {});
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to analyse these materials. Review the documents and try again.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The response exceeded the maximum output length. Try again.");
  }
  const raw = (response.parsed_output ?? args.schema.parse(JSON.parse(textOf(response.content)))) as z.infer<S>;
  // House style: no em/en dashes or typographic tells in anything we store or show.
  const data = sanitizeStrings(raw);
  return { data, usage: response.usage, model: response.model };
}


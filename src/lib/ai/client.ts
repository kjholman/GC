import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { env } from "../env";
import { sanitizeStrings } from "./style";
import { recordCreditOk } from "./credit";
import { recordUsage } from "./usage";

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
  /** "fast" for mechanical steps (cheaper model); "main" for judgement (memo, fact-check). */
  tier?: "main" | "fast";
  /** Label for spend reporting, e.g. "memo" or "fact-check". */
  step: string;
  /**
   * "structured" (default) constrains the output to the schema. "json" is the
   * fallback when the API rejects a structured request: the schema is given as
   * instructions and the answer is parsed and validated here.
   */
  mode?: "structured" | "json";
}): Promise<{ data: z.infer<S>; usage: Anthropic.Beta.BetaUsage; model: string }> {
  const json = args.mode === "json";
  const content: ContentBlock[] = json
    ? [
        ...args.content,
        {
          type: "text",
          text: `Return only one JSON object, with no other text, that matches this JSON Schema exactly:\n${JSON.stringify(z.toJSONSchema(args.schema))}`,
        },
      ]
    : args.content;
  const stream = anthropic().beta.messages.stream({
    model: args.tier === "fast" ? env.anthropicFastModel : env.anthropicModel,
    max_tokens: args.maxTokens ?? 64000,
    thinking: { type: "adaptive" },
    output_config: json ? { effort: args.effort } : { effort: args.effort, format: betaZodOutputFormat(args.schema) },
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    ...(args.system ? { system: args.system } : {}),
    messages: [{ role: "user", content }],
  });
  const response = await stream.finalMessage();
  recordUsage(response.model, response.usage, args.step);
  void recordCreditOk().catch(() => {});
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to analyse these materials. Review the documents and try again.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The response exceeded the maximum output length. Try again.");
  }
  const text = textOf(response.content);
  const raw = (json
    ? args.schema.parse(JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)))
    : (response.parsed_output ?? args.schema.parse(JSON.parse(text)))) as z.infer<S>;
  // House style: no em/en dashes or typographic tells in anything we store or show.
  const data = sanitizeStrings(raw);
  return { data, usage: response.usage, model: response.model };
}


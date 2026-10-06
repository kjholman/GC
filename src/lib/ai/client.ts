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
  /** Called with each top-level field name as the answer starts writing it (for live progress). */
  onSection?: (key: string) => void;
}): Promise<{ data: z.infer<S>; usage: Anthropic.Beta.BetaUsage; model: string }> {
  // Formats Anthropic can't compile into a strict grammar go straight to JSON mode
  // (validated and repaired here), and are remembered so later calls skip the failed attempt.
  if (args.mode !== "json" && TOO_COMPLEX.has(args.schema)) return structuredCall({ ...args, mode: "json" });
  try {
    return await structuredCallOnce(args);
  } catch (err) {
    if (args.mode === "json" || !isSchemaTooComplex(err)) throw err;
    console.warn(`[ai] ${args.step}: format too complex for strict output; using JSON mode`);
    TOO_COMPLEX.add(args.schema);
    return structuredCallOnce({ ...args, mode: "json" });
  }
}

const TOO_COMPLEX = new WeakSet<z.ZodType>();

/** Anthropic's 400s for output formats it can't compile ("grammar is too large", "too many union types"...). */
export function isSchemaTooComplex(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError) || err.status !== 400) return false;
  return /grammar|union types|schema.*(too|complex|large)|too many (parameters|properties)|output_config|output_format/i.test(err.message);
}

async function structuredCallOnce<S extends z.ZodType>(args: Parameters<typeof structuredCall<S>>[0]): Promise<{ data: z.infer<S>; usage: Anthropic.Beta.BetaUsage; model: string }> {
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
  if (args.onSection) {
    const scan = topLevelKeys(args.onSection);
    stream.on("text", (delta) => scan(delta));
  }
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
  let raw: z.infer<S>;
  if (!json && response.parsed_output) raw = response.parsed_output as z.infer<S>;
  else {
    try {
      raw = parseLenient(args.schema, looseJson(text));
    } catch (err) {
      // A long answer with a stray comma or bad escape should not cost the whole analysis: have it repaired.
      console.error(`[ai] ${args.step}: answer was not valid JSON, repairing`, err);
      raw = await repairJson(args.schema, text, err, args.step);
    }
  }
  // House style: no em/en dashes or typographic tells in anything we store or show.
  const data = sanitizeStrings(raw);
  return { data, usage: response.usage, model: response.model };
}


/**
 * Parses a model's JSON answer, forgiving the slips long outputs sometimes
 * contain: code fences, text around the object, trailing commas, raw line
 * breaks inside strings.
 */
export function looseJson(text: string): unknown {
  const body = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  const slice = start >= 0 && end > start ? body.slice(start, end + 1) : body;
  try {
    return JSON.parse(slice);
  } catch {
    let out = "";
    let inStr = false;
    for (let i = 0; i < slice.length; i++) {
      const ch = slice[i];
      if (inStr) {
        if (ch === "\\") { out += ch + (slice[i + 1] ?? ""); i++; continue; }
        if (ch === '"') inStr = false;
        out += ch === "\n" ? "\\n" : ch === "\r" ? "" : ch === "\t" ? "\\t" : ch;
        continue;
      }
      if (ch === '"') { inStr = true; out += ch; continue; }
      if (ch === ",") {
        // Drop a trailing comma before } or ].
        let j = i + 1;
        while (j < slice.length && /\s/.test(slice[j])) j++;
        if (slice[j] === "}" || slice[j] === "]") continue;
      }
      out += ch;
    }
    return JSON.parse(out);
  }
}

/** Asks the fast model to return the same answer as valid JSON matching the schema. */
async function repairJson<S extends z.ZodType>(schema: S, broken: string, err: unknown, step: string): Promise<z.infer<S>> {
  const response = await anthropic().beta.messages.stream({
    model: env.anthropicFastModel,
    max_tokens: 64000,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: `The JSON below could not be used: ${err instanceof Error ? err.message.slice(0, 600) : String(err)}\n\nReturn the same content as one valid JSON object that matches this JSON Schema, changing nothing except what is needed to make it valid. Return only the JSON.\n\nSchema:\n${JSON.stringify(z.toJSONSchema(schema))}\n\nJSON to fix:\n${broken}`,
      },
    ],
  }).finalMessage();
  recordUsage(response.model, response.usage, `${step} (repair)`);
  return parseLenient(schema, looseJson(textOf(response.content)));
}

/** Validates, first turning null into "" wherever the schema wants text (it asks for "" when unknown). */
function parseLenient<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const first = schema.safeParse(value);
  if (first.success) return first.data as z.infer<S>;
  let fixed = false;
  for (const issue of first.error.issues) {
    if (issue.code !== "invalid_type" || issue.expected !== "string" || !issue.path.length) continue;
    let node = value as Record<PropertyKey, unknown>;
    for (const key of issue.path.slice(0, -1)) node = node?.[key as PropertyKey] as Record<PropertyKey, unknown>;
    const last = issue.path[issue.path.length - 1] as PropertyKey;
    if (node && node[last] == null) { node[last] = ""; fixed = true; }
  }
  if (!fixed) throw first.error;
  return schema.parse(value) as z.infer<S>;
}

/**
 * Watches streamed JSON and reports each top-level key as it begins, so a long
 * answer can say which part it is on. Tolerates text before the opening brace.
 */
function topLevelKeys(onKey: (key: string) => void) {
  let depth = 0;
  let inStr = false;
  let escaped = false;
  let buf = "";
  let expectingKey = false;
  let pending: string | null = null;
  return (chunk: string) => {
    for (const ch of chunk) {
      if (inStr) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') { inStr = false; if (expectingKey && depth === 1) pending = buf; }
        else if (expectingKey && depth === 1 && buf.length < 64) buf += ch;
        continue;
      }
      if (ch === '"') { inStr = true; buf = ""; continue; }
      if (ch === "{" || ch === "[") { depth++; if (depth === 1 && ch === "{") expectingKey = true; continue; }
      if (ch === "}" || ch === "]") { depth--; continue; }
      if (depth === 1 && ch === ":" && pending) { const k = pending; pending = null; expectingKey = false; try { onKey(k); } catch {} continue; }
      if (depth === 1 && ch === ",") expectingKey = true;
    }
  };
}

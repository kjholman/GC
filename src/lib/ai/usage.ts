import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";

/** US$ per million tokens: input, output, cache read, cache write (5 min), cache write (1 h). */
const PRICES: Record<string, [number, number, number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2, 5, 8],
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5, 4],
  "claude-opus-5": [5, 25, 0.5, 6.25, 10],
  "claude-sonnet-5": [2, 10, 0.2, 2.5, 4],
  "claude-fable-5-1": [10, 50, 0.25, 12.5, 20],
  "claude-haiku-4-5": [1, 5, 0.1, 1.25, 2],
};
const WEB_SEARCH_USD = 0.01; // US$10 per 1,000 searches

function priceFor(model: string) {
  const key = Object.keys(PRICES).find((k) => model.startsWith(k));
  return PRICES[key ?? "claude-opus-5-5"];
}

/** Cost of one API response in US$. */
export function costOf(model: string, u: Anthropic.Beta.BetaUsage): number {
  const [inp, out, read, w5, w1h] = priceFor(model);
  const cc = (u as { cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } }).cache_creation;
  const write1h = cc?.ephemeral_1h_input_tokens ?? 0;
  const write5m = cc?.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens ?? 0) - write1h);
  const searches = (u as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
  return (
    ((u.input_tokens ?? 0) * inp + (u.output_tokens ?? 0) * out + (u.cache_read_input_tokens ?? 0) * read + write5m * w5 + write1h * w1h) / 1_000_000 +
    searches * WEB_SEARCH_USD
  );
}

type Meter = { analysisId?: string; purpose: string; usd: number };
const store = new AsyncLocalStorage<Meter>();

/** Runs `fn` with every AI call inside it attributed to `purpose` (and analysis, if given). */
export function withMeter<T>(meter: Omit<Meter, "usd">, fn: () => Promise<T>): Promise<T> {
  return store.run({ ...meter, usd: 0 }, fn);
}

/** Total spent so far inside the current withMeter() scope. */
export const meteredUsd = () => store.getStore()?.usd ?? 0;

/** Records one API response. Never throws. */
export function recordUsage(model: string, usage: Anthropic.Beta.BetaUsage, step: string) {
  const usd = costOf(model, usage);
  const m = store.getStore();
  if (m) m.usd += usd;
  void db.aiUsage
    .create({
      data: {
        purpose: m?.purpose ?? "other",
        step,
        analysisId: m?.analysisId ?? null,
        model,
        inputTokens: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        outputTokens: usage.output_tokens ?? 0,
        usd,
      },
    })
    .catch((err) => console.error("[usage] could not record", err));
}

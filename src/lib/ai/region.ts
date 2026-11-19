import "server-only";

/**
 * Where Anthropic processes GAIA's requests.
 *
 * Every request to the Messages API sets `inference_geo: "us"`, so the model runs only on
 * Anthropic's US infrastructure, never routed elsewhere. Anthropic offers only "us" and
 * "global"; there is no Canadian option, so US is the closest restriction available.
 * US-only processing is billed at 1.1 times the standard rate, which cost reporting and
 * estimates include.
 *
 * Storage at rest (files sent through the Files API, code execution used by web research)
 * follows the Anthropic workspace's own "workspace geo", which is set when the workspace is
 * created and is currently always "us". The workspace should also allow only the "us"
 * inference geo (Console → Settings → Data residency), so a request without it is refused.
 *
 * Each response reports where it ran (`usage.inference_geo`); anything other than "us"
 * stops the work rather than carrying on.
 */
export const INFERENCE_GEO = "us" as const;

/** Price multiplier Anthropic applies to US-only processing (all token types). */
export const REGION_PRICE_MULTIPLIER = 1.1;

export class RegionError extends Error {
  constructor(where: string, step: string) {
    super(`An AI request (${step}) was processed outside the United States (${where}). GAIA stopped this work. Ask your developer to check the Anthropic workspace's data residency settings.`);
    this.name = "RegionError";
  }
}

let warnedMissing = false;

/** Throws if the API reports the request ran anywhere but the US. */
export function checkRegion(usage: unknown, step: string): void {
  const where = (usage as { inference_geo?: string | null } | null)?.inference_geo;
  if (where && where !== INFERENCE_GEO) {
    console.error(`[region] ${step}: processed in "${where}", expected "${INFERENCE_GEO}"`);
    throw new RegionError(where, step);
  }
  if (!where && !warnedMissing) {
    warnedMissing = true;
    console.warn(`[region] ${step}: the response did not say where it was processed; requests are still sent with inference_geo "${INFERENCE_GEO}"`);
  }
}

import { db } from "../db";
import type { Precedents } from "../ai/prompts";

/**
 * Precedent retrieval: ranks the firm's historical deals and endorsed exemplar
 * memos by similarity to a new opportunity's fingerprint. Deliberately
 * transparent (every match carries a human-readable "why") so partners can see
 * what the analyst was shown, and vendor-neutral (runs inside Postgres data).
 */

type Probe = { sector?: string | null; modality?: string | null; indication?: string | null; tags?: string[] };

const STOP = new Set(["and", "the", "of", "for", "with", "in", "to", "a", "an", "or", "based", "therapy", "therapeutics"]);

function tokens(s: string | null | undefined): Set<string> {
  return new Set(
    (s ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

function overlap(a: Set<string>, b: Set<string>) {
  return [...a].filter((x) => b.has(x));
}

export function similarity(probe: Probe, cand: Probe): { score: number; why: string } {
  const reasons: string[] = [];
  let score = 0;
  if (probe.sector && cand.sector && probe.sector.toLowerCase() === cand.sector.toLowerCase()) {
    score += 3;
    reasons.push(`same sector (${cand.sector})`);
  }
  const mod = overlap(tokens(probe.modality), tokens(cand.modality));
  if (mod.length) {
    score += 2 + mod.length;
    reasons.push(`similar modality (${mod.join(", ")})`);
  }
  const ind = overlap(tokens(probe.indication), tokens(cand.indication));
  if (ind.length) {
    score += 2 + ind.length;
    reasons.push(`related indication (${ind.join(", ")})`);
  }
  const tagSet = new Set((cand.tags ?? []).map((t) => t.toLowerCase()));
  const tagHits = (probe.tags ?? []).map((t) => t.toLowerCase()).filter((t) => tagSet.has(t));
  if (tagHits.length) {
    score += 1.5 * tagHits.length;
    reasons.push(`shared themes (${tagHits.slice(0, 5).join(", ")})`);
  }
  return { score, why: reasons.join("; ") || "general comparison" };
}

export async function findPrecedents(
  probe: Probe,
  opts: { excludeHistoricalId?: string; beforeYear?: number | null; maxHistorical?: number; maxExemplars?: number } = {},
): Promise<Precedents> {
  const [historical, exemplars] = await Promise.all([
    db.historicalDeal.findMany({
      where: {
        ingestStatus: "READY",
        ...(opts.excludeHistoricalId ? { id: { not: opts.excludeHistoricalId } } : {}),
        // In backtests, only show what the firm had decided before the replayed deal.
        ...(opts.beforeYear ? { OR: [{ decisionYear: { lt: opts.beforeYear } }, { decisionYear: null }] } : {}),
      },
      select: {
        id: true, companyName: true, decisionYear: true, decision: true, decisionRationale: true, outcome: true,
        outcomeNotes: true, sector: true, modality: true, indication: true, stage: true, digest: true, tags: true,
      },
    }),
    db.exemplar.findMany({ where: { active: true } }),
  ]);

  const rankedHist = historical
    .map((h) => ({ ...h, ...similarity(probe, h) }))
    .filter((h) => h.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.maxHistorical ?? 6);

  const rankedEx = exemplars
    .map((e) => ({ ...e, ...similarity(probe, e) }))
    .filter((e) => e.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.maxExemplars ?? 2);

  return {
    historical: rankedHist.map((h) => ({
      id: h.id, companyName: h.companyName, decisionYear: h.decisionYear, decision: h.decision, decisionRationale: h.decisionRationale,
      outcome: h.outcome, outcomeNotes: h.outcomeNotes, sector: h.sector, modality: h.modality, indication: h.indication,
      stage: h.stage, digest: h.digest, why: h.why,
    })),
    exemplars: rankedEx.map((e) => ({
      id: e.id, title: e.title, recommendation: e.recommendation, overallScore: e.overallScore,
      partnerCommentary: e.partnerCommentary, memo: e.memo, why: e.why,
    })),
  };
}

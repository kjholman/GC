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

/**
 * Words that mean the same thing in a deck, so "cancer" matches "oncology" and
 * "NASH" matches "MASH". Each word maps to one canonical term.
 */
const SYNONYMS: Record<string, string[]> = {
  oncology: ["cancer", "cancers", "tumor", "tumour", "tumors", "tumours", "carcinoma", "neoplasm", "oncologic", "solid", "leukemia", "leukaemia", "lymphoma", "myeloma"],
  mash: ["nash", "nafld", "masld", "steatohepatitis", "fatty", "liver"],
  cardiovascular: ["cardiac", "heart", "cardio", "cardiology", "vascular", "hypertension", "atherosclerosis", "hfpef", "hfref"],
  neurology: ["neuro", "neurological", "cns", "brain", "neurodegenerative", "neurodegeneration", "alzheimer", "alzheimers", "parkinson", "parkinsons", "als", "epilepsy"],
  psychiatry: ["depression", "mental", "psychiatric", "anxiety", "schizophrenia", "ptsd"],
  antibody: ["antibodies", "mab", "mabs", "monoclonal", "adc", "bispecific"],
  oligonucleotide: ["sirna", "rnai", "antisense", "aso", "oligo", "mrna"],
  gene: ["aav", "lentiviral", "crispr", "editing", "genetic"],
  cell: ["cart", "car", "nk", "stem", "allogeneic", "autologous"],
  device: ["devices", "implant", "implantable", "catheter", "instrument", "surgical", "wearable"],
  diagnostic: ["diagnostics", "dx", "assay", "assays", "biomarker", "screening", "imaging", "liquid", "biopsy"],
  metabolic: ["diabetes", "diabetic", "t2d", "obesity", "obese", "glp", "insulin", "weight"],
  fibrosis: ["fibrotic", "ipf", "scarring"],
  inflammation: ["inflammatory", "autoimmune", "immunology", "immune", "nlrp3", "arthritis", "lupus", "psoriasis", "ibd", "crohn", "colitis"],
  infectious: ["infection", "infections", "antimicrobial", "antibiotic", "antibiotics", "bacterial", "antiviral", "viral", "fungal", "vaccine", "vaccines", "amr"],
  ophthalmology: ["ophthalmic", "eye", "retinal", "retina", "ocular", "macular", "glaucoma"],
  renal: ["kidney", "nephrology", "ckd"],
  respiratory: ["pulmonary", "lung", "lungs", "asthma", "copd"],
  dermatology: ["skin", "dermal", "dermatologic", "topical", "wound"],
  rare: ["orphan", "ultra"],
  radiopharmaceutical: ["radioligand", "radiotherapeutic", "radionuclide", "radiopharma", "theranostic"],
  digital: ["software", "app", "ai", "algorithm", "saas", "platform"],
  pain: ["analgesic", "analgesia", "opioid", "nociception"],
};
const CANON = new Map<string, string>();
for (const [canon, words] of Object.entries(SYNONYMS)) {
  CANON.set(canon, canon);
  for (const w of words) CANON.set(w, canon);
}
const canonical = (t: string) => CANON.get(t) ?? CANON.get(t.replace(/s$/, "")) ?? t.replace(/(ies)$/, "y").replace(/([^s])s$/, "$1");

function tokens(s: string | null | undefined): Set<string> {
  return new Set(
    (s ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP.has(t))
      .map(canonical)
      .filter((t) => t.length > 2 || CANON.has(t)),
  );
}

function overlap(a: Set<string>, b: Set<string>) {
  return [...a].filter((x) => b.has(x));
}

export function similarity(probe: Probe, cand: Probe): { score: number; why: string } {
  const reasons: string[] = [];
  let score = 0;
  const sameSector = (a: string, b: string) => a.toLowerCase() === b.toLowerCase() || [...tokens(a)].sort().join(" ") === [...tokens(b)].sort().join(" ");
  if (probe.sector && cand.sector && sameSector(probe.sector, cand.sector)) {
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
  const portfolio = opts.beforeYear ? [] : await db.portfolioCompany.findMany({ select: { name: true, sector: true, modality: true, indication: true, outcome: true } });
  const rankedPortfolio = portfolio
    .map((c) => ({ ...c, ...similarity(probe, c) }))
    .filter((c) => c.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

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
    portfolio: rankedPortfolio.map((c) => ({ name: c.name, outcome: c.outcome, why: c.why })),
    exemplars: rankedEx.map((e) => ({
      id: e.id, title: e.title, recommendation: e.recommendation, overallScore: e.overallScore,
      partnerCommentary: e.partnerCommentary, memo: e.memo, why: e.why,
    })),
  };
}

import { z } from "zod";

/**
 * The investment memo the AI analyst produces. This schema is sent to the
 * model as a structured-output contract (output_config.format), so every
 * field is required; "unknown" is expressed as null or an explicit statement.
 */

export const RECOMMENDATIONS = ["REJECT", "PENDING_INFO", "ADVANCE_TO_DILIGENCE"] as const;
export const SCORE_DIMENSIONS = [
  "Science & Technology",
  "Clinical & Regulatory Path",
  "Intellectual Property",
  "Management Team",
  "Market & Commercial",
  "Financials & Valuation",
  "Capital Plan & Syndicate",
  "Genesys Strategic Fit",
] as const;

const Severity = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const Priority = z.enum(["CRITICAL", "IMPORTANT", "SUPPLEMENTARY"]);

export const MemoSchema = z.object({
  company: z.object({
    name: z.string(),
    oneLiner: z.string().describe("One sentence a partner could repeat in IC."),
    sector: z.string().describe("e.g. Therapeutics, Medical Devices, Diagnostics, Digital Health, Platform/Tools"),
    modality: z.string().describe("e.g. Small molecule, Antibody, Radiopharmaceutical, Gene therapy, Class II device"),
    leadIndication: z.string().nullable(),
    developmentStage: z.string().describe("e.g. Discovery, Preclinical (IND-enabling), Phase 1, 510(k) cleared"),
    headquarters: z.string().nullable(),
    roundSought: z.string().nullable().describe("Round type and amount, e.g. 'Series A, US$25M'"),
    website: z.string().nullable(),
    founderContactName: z.string().nullable(),
    founderContactEmail: z.string().nullable(),
  }),

  recommendation: z.enum(RECOMMENDATIONS),
  conviction: z.enum(["LOW", "MEDIUM", "HIGH"]),
  overallScore: z.number().int().describe("0-100 composite attractiveness score."),

  worthOurTime: z.object({
    verdict: z.boolean(),
    headline: z.string().describe("A single decisive sentence."),
    rationale: z.string().describe("2-4 paragraphs: why or why not, written for a Managing Partner."),
  }),

  executiveSummary: z.string().describe("A tight IC-style summary, 250-400 words."),
  investmentHighlights: z.array(z.string()),
  keyRisks: z.array(
    z.object({ risk: z.string(), severity: Severity, mitigation: z.string() }),
  ),
  redFlags: z.array(z.string()).describe("Deal-breakers or integrity concerns. Empty if none."),

  scorecard: z.array(
    z.object({
      dimension: z.enum(SCORE_DIMENSIONS),
      score: z.number().int().describe("1-10"),
      assessment: z.string(),
      evidence: z.string().describe("What in the materials supports this score, with slide/page refs where possible."),
    }),
  ),

  science: z.object({
    mechanismOfAction: z.string(),
    biologicalRationale: z.string().describe("Strength of target validation / human genetics / clinical precedent."),
    dataQuality: z.string().describe("Critical appraisal of the data presented: n, controls, models, reproducibility, statistics."),
    keyExperimentsToDerisk: z.array(z.string()),
    translationalRisk: z.string(),
  }),

  clinicalRegulatory: z.object({
    pathway: z.string().describe("FDA / Health Canada / EMA route, designations available."),
    milestones: z.array(
      z.object({
        milestone: z.string(),
        expectedTiming: z.string(),
        capitalRequired: z.string().nullable(),
        valueInflection: z.boolean(),
      }),
    ),
    probabilityOfSuccess: z.string().describe("Benchmark against historical phase-transition rates for the modality and indication."),
  }),

  intellectualProperty: z.object({
    position: z.string(),
    concerns: z.array(z.string()),
  }),

  market: z.object({
    unmetNeed: z.string(),
    addressableMarket: z.string().describe("Bottom-up where possible; flag inflated top-down TAM claims."),
    reimbursementAndAccess: z.string(),
    competitors: z.array(
      z.object({ name: z.string(), stage: z.string(), differentiation: z.string() }),
    ),
    likelyAcquirers: z.array(z.string()),
  }),

  team: z.object({
    assessment: z.string(),
    strengths: z.array(z.string()),
    gaps: z.array(z.string()),
  }),

  financials: z.object({
    askAndUseOfFunds: z.string(),
    valuationView: z.string().describe("Pre-money reasonableness against comparable rounds."),
    burnAndRunway: z.string(),
    capitalToNextInflection: z.string(),
    projectionsCritique: z.string(),
    returnScenarios: z.array(
      z.object({
        scenario: z.enum(["BEAR", "BASE", "BULL"]),
        exitRoute: z.string(),
        exitValueUsdM: z.number().nullable(),
        yearsToExit: z.number().nullable(),
        grossMoic: z.number().nullable().describe("Multiple on Genesys' invested capital after expected dilution."),
        probability: z.number().describe("0-1; the three scenarios should sum to ~1 (residual = loss)."),
        rationale: z.string(),
      }),
    ),
  }),

  portfolioFit: z.object({
    thesisAlignment: z.string(),
    comparableGenesysInvestments: z.array(
      z.object({
        company: z.string(),
        similarity: z.string(),
        lesson: z.string().describe("What that investment's trajectory implies for this one."),
      }),
    ),
    portfolioConflicts: z.string().nullable(),
    canadianNexus: z.string().describe("Canadian HQ, IP, team or development footprint."),
    syndicateView: z.string().describe("Likely co-investors and Genesys' role (lead / co-lead / follow)."),
  }),

  informationRequests: z.array(
    z.object({
      category: z.string(),
      request: z.string(),
      rationale: z.string(),
      priority: Priority,
    }),
  ),

  dueDiligencePlan: z
    .object({
      workstreams: z.array(
        z.object({
          name: z.string(),
          objective: z.string(),
          tasks: z.array(z.string()),
          externalExperts: z.array(z.string()),
          durationWeeks: z.number(),
        }),
      ),
      criticalQuestionsForIC: z.array(z.string()),
      documentRequestList: z.array(z.string()),
      estimatedTotalWeeks: z.number(),
    })
    .nullable()
    .describe("Only populated when recommendation is ADVANCE_TO_DILIGENCE; otherwise null."),

  founderEmail: z.object({
    subject: z.string(),
    body: z.string().describe("Plain text, ready to paste. Signed with [Your name] placeholder."),
  }),

  versionDelta: z
    .string()
    .nullable()
    .describe("For follow-up analyses: what the new information changed and why. Null on the first screen."),
  analystCaveats: z.string().describe("What the analysis could not assess and any assumptions made."),
});

export type Memo = z.infer<typeof MemoSchema>;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

/** Clamp and normalise model output that structured outputs can't constrain. */
export function normaliseMemo(memo: Memo): Memo {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
  return {
    ...memo,
    overallScore: clamp(memo.overallScore, 0, 100),
    scorecard: memo.scorecard.map((s) => ({ ...s, score: clamp(s.score, 1, 10) })),
    // Diligence requirements are only issued for deals that pass screening.
    dueDiligencePlan: memo.recommendation === "ADVANCE_TO_DILIGENCE" ? memo.dueDiligencePlan : null,
  };
}

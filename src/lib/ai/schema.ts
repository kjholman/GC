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

export const EVIDENCE_SOURCES = [
  "DECK_OR_MATERIALS",
  "RESEARCH_BRIEF",
  "COMPETITOR_SWEEP",
  "PRECEDENT",
  "FIRM_CONTEXT",
  "BENCHMARK",
  "GENERAL_KNOWLEDGE",
  "ANALYST_INFERENCE",
] as const;
export const EVIDENCE_STATUSES = ["VERIFIED_IN_SOURCE", "COMPANY_CLAIM", "INFERENCE", "NEEDS_VERIFICATION"] as const;

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
    position: z.string().describe("Overall IP assessment for a partner: what is protected, how strongly, for how long."),
    strength: z.enum(["STRONG", "ADEQUATE", "WEAK", "UNCLEAR"]),
    assets: z
      .array(
        z.object({
          identifier: z.string().describe("Patent or application number exactly as it appears in a source, or a description such as 'Provisional application (number not disclosed)'."),
          title: z.string(),
          type: z.enum(["COMPOSITION_OF_MATTER", "METHOD_OF_USE", "DEVICE", "FORMULATION", "PROCESS", "PLATFORM", "OTHER"]),
          status: z.enum(["GRANTED", "PENDING", "PCT", "PROVISIONAL", "LAPSED", "UNKNOWN"]),
          jurisdictions: z.string().nullable(),
          ownerOrAssignee: z.string().nullable(),
          estimatedExpiry: z.string().nullable().describe("Typically 20 years from priority/filing; note PTE/SPC possibilities."),
          source: z.string().describe("Deck page or URL from the research."),
        }),
      )
      .describe("Every patent family or application identified in the materials or research. Empty if none."),
    ownershipAndLicensing: z.string().describe("Chain of title: assignment from inventors/university, exclusive licence terms (field, territory, royalties, milestones, sublicensing), encumbrances."),
    freedomToOperate: z.string().describe("Named third-party patents or families that could block, and how serious they look. 'Not assessed' if no information."),
    exclusivityRunway: z.string().describe("Years of protection from patents plus regulatory exclusivity (e.g. U.S. NCE 5 yrs, orphan 7 yrs, biologics 12 yrs; Canadian data protection 8 yrs)."),
    tradeSecretsAndKnowHow: z.string(),
    concerns: z.array(z.string()),
    diligenceSteps: z.array(z.string()).describe("Specific IP work required: claim review, FTO search, licence review."),
  }),

  market: z.object({
    unmetNeed: z.string(),
    standardOfCare: z.string().describe("Current treatment paradigm or clinical workflow, and where this product would fit."),
    patientPopulation: z
      .array(
        z.object({
          segment: z.string().describe("e.g. 'Diagnosed HFpEF', 'with hsCRP ≥2 mg/L', 'eligible and treated'"),
          geography: z.string(),
          value: z.string().describe("Number with units, e.g. '6.2M patients'"),
          basis: z.string().describe("Source or derivation."),
        }),
      )
      .describe("Funnel from total prevalence/incidence down to the addressable, treated population."),
    pricingAnalogues: z.array(z.object({ product: z.string(), price: z.string(), relevance: z.string() })),
    marketSizing: z.object({
      method: z.string().describe("Bottom-up calculation spelled out: patients × penetration × price × compliance."),
      assumptions: z.array(z.string()),
      tamUsdM: z.number().nullable(),
      samUsdM: z.number().nullable(),
      peakSalesUsdM: z.object({ low: z.number().nullable(), base: z.number().nullable(), high: z.number().nullable() }),
      deckClaimCritique: z.string().describe("How the deck's market claims compare with the bottom-up view."),
    }),
    addressableMarket: z.string().describe("One-paragraph conclusion on market size and quality."),
    reimbursementAndAccess: z.string().describe("Payer path in the U.S. (CMS/commercial, coding for devices/diagnostics) and Canada (Canada's Drug Agency, pCPA, provincial)."),
    adoptionBarriers: z.array(z.string()),
    marketTiming: z.string().describe("Trends, guideline changes, patent cliffs or catalysts that help or hurt timing."),
    competitors: z.array(
      z.object({ name: z.string(), stage: z.string(), differentiation: z.string() }),
    ),
    likelyAcquirers: z.array(z.string()),
    comparableOutcomes: z
      .string()
      .describe("What the competitive sweep shows: how companies doing the same thing fared, what they raised and from whom, and what that implies for this deal's odds, valuation, syndicate and exit."),
  }),

  team: z.object({
    assessment: z.string().describe("Overall view of the founders and management for a partner."),
    members: z.array(
      z.object({
        name: z.string().describe("Exactly as named in the materials or research."),
        role: z.string(),
        background: z.string().describe("Education, training and career path."),
        relevantExperience: z.string().describe("Experience directly relevant to this company's next 3 years (drug/device development, regulatory, fundraising, commercial)."),
        priorVentures: z.string().describe("Prior companies founded or led, and their outcomes. 'None identified' if none."),
        commitment: z.string().describe("Full-time, part-time, still in an academic post, or unknown."),
        verification: z.enum(["VERIFIED", "PARTIALLY_VERIFIED", "UNVERIFIED"]).describe("Whether the research independently confirms this person's background."),
        concerns: z.string().nullable(),
      }),
    ),
    founderMarketFit: z.string(),
    boardAndAdvisors: z.string().describe("Board composition, independent directors, scientific/clinical advisors and their value."),
    strengths: z.array(z.string()),
    gaps: z.array(z.string()).describe("Missing roles or capabilities for the next stage."),
    hiringPriorities: z.array(z.string()),
    referenceChecks: z.array(z.string()).describe("Specific references to call and what to ask."),
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
    historicalPrecedents: z
      .array(
        z.object({
          company: z.string(),
          genesysDecision: z.string(),
          relevance: z.string().describe("How this past decision and its outcome inform the view on this deal."),
        }),
      )
      .describe("Past Genesys decisions from the precedents section that bear on this deal. Empty if none were provided."),
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

  gaps: z
    .array(
      z.object({
        area: z.string().describe("e.g. Science, Clinical, Regulatory, IP, Team, Market, Competition, Financials, Fit."),
        gap: z.string().describe("What could not be established, stated plainly."),
        whyItIsAGap: z.string().describe("Why it could not be covered: not in the materials, not public, needs expert judgement, needs a document under NDA, sources conflict, and so on."),
        howToClose: z.string().describe("The specific manual step that would close it, e.g. 'Ask the founders for the 14-day tox report' or 'Commission a freedom-to-operate opinion'."),
        whoCanClose: z.enum(["FOUNDERS", "GENESYS_TEAM", "EXTERNAL_EXPERT"]),
        priority: Priority,
      }),
    )
    .describe("Everything material this analysis could not cover and that needs a person to follow up. Empty only if there is truly nothing."),

  evidence: z
    .array(
      z.object({
        id: z.string().describe("E1, E2, … referenced in the prose as [E1]."),
        claim: z.string(),
        sourceType: z.enum(EVIDENCE_SOURCES),
        sourceRef: z.string().describe("Filename + page/slide, URL from the research brief, company name, or the evidence ids an inference rests on."),
        quote: z.string().nullable().describe("Verbatim excerpt (5-40 words) copied exactly from the source, or null."),
        status: z.enum(EVIDENCE_STATUSES),
      }),
    )
    .describe("Ledger of every material claim in this memo."),
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

export const FingerprintSchema = z.object({
  companyName: z.string().nullable(),
  website: z.string().nullable().describe("The company's own website as given in the materials, e.g. 'northbridgetx.com'. Null if not stated."),
  sector: z.string(),
  modality: z.string(),
  indication: z.string().nullable(),
  stage: z.string().nullable(),
  tags: z.array(z.string()),
  digest: z.string(),
  researchDossier: z.string().describe("Factual extraction for the research team; see the prompt."),
});
export type Fingerprint = z.infer<typeof FingerprintSchema>;

export const FeedbackLessonSchema = z.object({
  lesson: z.string().describe("One or two plain sentences: what to do differently on future deals. Written as an instruction to yourself, specific enough to act on."),
  appliesTo: z.string().describe("Which future deals this applies to, e.g. 'early-stage medical device deals' or 'all deals'."),
});

export const SuggestionsSchema = z.object({
  suggestions: z.array(z.object({ title: z.string(), body: z.string(), evidence: z.string() })),
});

export const VERIFICATION_PROBLEMS = [
  "UNSUPPORTED",
  "CONTRADICTED",
  "MISQUOTED",
  "NUMBER_MISMATCH",
  "FABRICATED_ENTITY",
  "OVERSTATED_CERTAINTY",
  "ALREADY_PROVIDED",
  "RULE_VIOLATION",
  "INTERNAL_INCONSISTENCY",
] as const;

export const VerificationSchema = z.object({
  claimsChecked: z.number().int(),
  issues: z.array(
    z.object({
      location: z.string().describe("Memo field path, e.g. science.dataQuality or evidence E7."),
      excerpt: z.string().describe("The exact text in the memo that is wrong."),
      problem: z.enum(VERIFICATION_PROBLEMS),
      severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
      explanation: z.string().describe("What the sources actually say, with page or URL."),
      correction: z.string().describe("How the memo should read instead (or 'remove')."),
    }),
  ),
  decisionSupported: z.boolean().describe("Whether the recommendation follows from the verified evidence and the decision rules."),
  assessment: z.string().describe("Two or three sentences on the memo's overall factual reliability."),
});
export type Verification = z.infer<typeof VerificationSchema>;

const FundingRound = z.object({
  round: z.string().describe("e.g. Seed, Series A, Series B, IPO, grant"),
  date: z.string().nullable().describe("YYYY or YYYY-MM"),
  amountUsdM: z.number().nullable(),
  amountText: z.string().nullable().describe("As reported, with currency, e.g. 'C$12M'"),
  leadInvestors: z.array(z.string()),
  otherInvestors: z.array(z.string()),
  sourceUrl: z.string().nullable(),
});

export const CompetitorSweepSchema = z.object({
  competitors: z.array(
    z.object({
      name: z.string(),
      headquarters: z.string().nullable(),
      relationship: z.enum(["DIRECT", "ADJACENT", "PRECEDENT"]).describe("DIRECT: same target/mechanism or same product for the same use. ADJACENT: same indication or problem by a different approach. PRECEDENT: an earlier company that attempted the same thing."),
      approach: z.string().describe("What they do, and how it compares with the company under review."),
      stage: z.string().nullable().describe("Current or final development stage."),
      status: z.enum(["ACTIVE", "ACQUIRED", "IPO", "PARTNERED", "FAILED", "SHUT_DOWN", "PIVOTED", "UNKNOWN"]),
      outcome: z.string().describe("What happened: exits with value and acquirer, trial results, failures and why. 'Unknown' if not found."),
      totalFundingUsdM: z.number().nullable(),
      fundingRounds: z.array(FundingRound),
      investorProfile: z.string().describe("Who backed them: specialist life-science VCs, generalists, corporate/strategic, government, Canadian funds."),
      genesysLikeInvestors: z.boolean().describe("Backed by early-stage, life-science-specialist, company-building investors comparable to Genesys."),
      lessonForThisDeal: z.string(),
      sources: z.array(z.string()).describe("URLs from the research notes supporting this entry."),
    }),
  ),
  activeInvestors: z.array(
    z.object({
      name: z.string(),
      backedCompanies: z.array(z.string()),
      type: z.string().describe("e.g. Life-science VC, generalist VC, corporate venture, government, crossover"),
      canadian: z.boolean(),
      genesysLike: z.boolean(),
      relevance: z.string().describe("Potential co-investor, competitor for the deal, or signal of the field's investability."),
    }),
  ),
  fieldSummary: z.object({
    crowding: z.string().describe("How crowded the space is and where the company sits."),
    capitalRaisedInField: z.string(),
    whatSeparatedWinners: z.string().describe("Patterns that distinguished successful companies from failures."),
    exitPattern: z.string().describe("How value has been realised: acquirers, licensing deals, IPOs, typical stage and values."),
    implicationsForGenesys: z.string(),
  }),
  gaps: z.string().describe("What could not be found or verified."),
});
export type CompetitorSweep = z.infer<typeof CompetitorSweepSchema>;

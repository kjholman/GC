import "server-only";
import { extractText as pdfText, getDocumentProxy } from "unpdf";
import type { Document } from "@prisma/client";
import { db } from "../db";
import { SCORE_DIMENSIONS, VerificationSchema, type Memo, type Verification } from "./schema";
import { structuredCall, type ContentBlock } from "./client";
import { findBannedPhrases } from "./style";

/**
 * Anti-hallucination layer
 * ────────────────────────
 * 1. Deterministic checks in code: every verbatim quote in the evidence ledger
 *    must actually occur in the source text; every URL must come from the
 *    research brief; every Genesys company cited must exist in the firm's
 *    records; the decision, scores and plan must be internally consistent.
 * 2. An independent, adversarial fact-check by a second model pass that sees
 *    the sources and the memo, but not the author's reasoning.
 * The pipeline revises the memo when HIGH-severity issues are found, re-checks
 * it, and records the full report. A human must sign off before founder
 * correspondence can be used.
 */

export const VERIFIER_PROMPT = `
You are the independent fact-checker for Genesys Capital's investment committee. You did not write the memo below; another analyst did. Your job is to catch any statement that is not supported by the sources before it reaches the partners. A missed error could cost the firm money or mislead a founder, so be thorough and sceptical. Be fair as well: do not flag reasonable, clearly labelled analytical judgement.

**Sources available to you:**
- the attached documents
- the web research (the research brief and the competitive sweep notes)
- the precedent list

The memo's evidence ledger and its prose must agree with these sources.

**Check each of the following:**
1. **Evidence entries.** Check every entry in the evidence ledger:
   - The claim must match its source, and the quote must appear in that source.
   - VERIFIED_IN_SOURCE must really be shown by the source, not merely asserted by the company.
2. **Numbers and named entities in the prose.** Check every number and named entity: data values, n, dollar amounts, dates, market sizes, competitors, funding rounds, investors, trials, deals, people and publications. Flag any not traceable to a source, or labelled with the wrong source type.
3. **Information requests.** Flag any request for information the materials already contain (ALREADY_PROVIDED).
4. **The recommendation.** Check that it follows the decision rules given the verified evidence, and that the score is consistent with the scorecard.
5. **Overstated certainty.** Flag company claims or inferences presented as established fact.
6. **The founder email.** It must not contain internal scores, mention AI, or contain claims absent from the memo.

**Severity:**
- **HIGH:** fabricated or contradicted facts, misquotes, wrong numbers, or a decision the evidence does not support.
- **MEDIUM:** unsupported but plausible claims, or overstated certainty.
- **LOW:** minor labelling problems.

Report only real problems. For each, quote the exact memo text, explain what the sources actually say (with page or URL), and give the correction. If the memo is clean, return an empty issues list.
`.trim();

export type Issue = Verification["issues"][number] & { origin: "automated" | "fact-checker" };
export type VerificationReport = {
  status: "PASSED" | "WARNINGS" | "FAILED";
  claimsChecked: number;
  evidenceCount: number;
  quotesVerified: number;
  decisionSupported: boolean;
  assessment: string;
  issues: Issue[];
  revisions: number;
  checkedAt: string;
};

// ─── Source text ────────────────────────────────────────────────────────────

/** Returns the plain text of each document, extracting (and caching) PDF text. */
export async function sourceTexts(docs: Document[]): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = [];
  for (const d of docs) {
    if (d.extractedText != null) {
      out.push({ name: d.filename, text: d.extractedText });
      continue;
    }
    if (d.plainText != null) {
      out.push({ name: d.filename, text: d.plainText });
      continue;
    }
    if (d.mimeType === "application/pdf") {
      try {
        const pdf = await getDocumentProxy(new Uint8Array(d.data));
        const { text } = await pdfText(pdf, { mergePages: false });
        const joined = (text as string[]).map((t, i) => `[page ${i + 1}]\n${t}`).join("\n");
        await db.document.update({ where: { id: d.id }, data: { plainText: joined } });
        out.push({ name: d.filename, text: joined });
      } catch {
        out.push({ name: d.filename, text: "" });
      }
    }
  }
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[^a-z0-9%.$µμ\-+'"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** True when the quote occurs in the haystack (exactly, or ≥85% of its 6-word shingles). */
export function quoteFound(quote: string, haystack: string): boolean {
  const q = norm(quote);
  const h = norm(haystack);
  if (!q || !h) return false;
  if (h.includes(q)) return true;
  const words = q.split(" ");
  if (words.length < 6) return false;
  const shingles: string[] = [];
  for (let i = 0; i + 6 <= words.length; i++) shingles.push(words.slice(i, i + 6).join(" "));
  const hits = shingles.filter((s) => h.includes(s)).length;
  return hits / shingles.length >= 0.85;
}

// ─── Deterministic checks ───────────────────────────────────────────────────

export function automatedChecks(
  memo: Memo,
  ctx: { sources: { name: string; text: string }[]; research: string | null; portfolioNames: string[]; precedentNames: string[] },
): { issues: Issue[]; quotesVerified: number; sanitized: Memo } {
  const issues: Issue[] = [];
  const add = (i: Omit<Issue, "origin">) => issues.push({ ...i, origin: "automated" });
  const allSource = ctx.sources.map((s) => s.text).join("\n");
  let quotesVerified = 0;
  const ids = new Set(memo.evidence.map((e) => e.id));

  for (const e of memo.evidence) {
    if (e.quote) {
      const web = e.sourceType === "RESEARCH_BRIEF" || e.sourceType === "COMPETITOR_SWEEP";
      const hay = web ? ctx.research ?? "" : e.sourceType === "DECK_OR_MATERIALS" ? allSource : `${allSource}\n${ctx.research ?? ""}`;
      // Scanned PDFs have no text layer; we can only verify where text exists.
      const verifiable = web ? !!ctx.research : allSource.trim().length > 200;
      if (verifiable) {
        if (quoteFound(e.quote, hay)) quotesVerified++;
        else
          add({
            location: `evidence ${e.id}`,
            excerpt: e.quote,
            problem: "MISQUOTED",
            severity: "HIGH",
            explanation: `This quote does not appear in ${web ? "the web research notes" : "the submitted materials"} (${e.sourceRef}).`,
            correction: "Quote the source exactly, or mark the claim NEEDS_VERIFICATION with no quote.",
          });
      }
    } else if (e.status === "VERIFIED_IN_SOURCE" && (e.sourceType === "DECK_OR_MATERIALS" || e.sourceType === "RESEARCH_BRIEF" || e.sourceType === "COMPETITOR_SWEEP")) {
      add({
        location: `evidence ${e.id}`, excerpt: e.claim, problem: "OVERSTATED_CERTAINTY", severity: "MEDIUM",
        explanation: "Marked verified in source but no supporting quote was given.", correction: "Provide an exact quote or downgrade the status.",
      });
    }
    if (e.sourceType === "GENERAL_KNOWLEDGE" && e.status !== "NEEDS_VERIFICATION") {
      add({
        location: `evidence ${e.id}`, excerpt: e.claim, problem: "OVERSTATED_CERTAINTY", severity: "LOW",
        explanation: "Background-knowledge claims must be flagged for verification.", correction: "Set status to NEEDS_VERIFICATION.",
      });
    }
  }

  // URLs must come from the research brief or the materials.
  const memoText = JSON.stringify({ ...memo, evidence: undefined });
  const ledgerText = JSON.stringify(memo.evidence);
  const urls = new Set([...`${memoText} ${ledgerText}`.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map((m) => m[0].replace(/[.,;]+$/, "")));
  const allowed = `${ctx.research ?? ""}\n${allSource}`;
  for (const u of urls) {
    if (!allowed.includes(u) && !allowed.includes(u.replace(/^https?:\/\//, ""))) {
      add({ location: "memo", excerpt: u, problem: "FABRICATED_ENTITY", severity: "HIGH", explanation: "This URL does not appear in the web research or the materials.", correction: "remove" });
    }
  }

  // Dangling evidence tags.
  const tags = new Set([...memoText.matchAll(/\[(E\d+)\]/g)].map((m) => m[1]));
  const dangling = [...tags].filter((t) => !ids.has(t));
  if (dangling.length) {
    add({ location: "memo", excerpt: dangling.map((d) => `[${d}]`).join(" "), problem: "INTERNAL_INCONSISTENCY", severity: "MEDIUM", explanation: "Evidence tags reference entries that are not in the ledger.", correction: "Add the ledger entries or remove the tags." });
  }

  // Only real Genesys companies and retrieved precedents may be cited.
  const known = (list: string[], name: string) => list.some((n) => norm(n) === norm(name) || norm(name).includes(norm(n)) || norm(n).includes(norm(name)));
  const sanitized: Memo = structuredClone(memo);
  sanitized.portfolioFit.comparableGenesysInvestments = memo.portfolioFit.comparableGenesysInvestments.filter((c) => {
    if (known(ctx.portfolioNames, c.company)) return true;
    add({ location: "portfolioFit.comparableGenesysInvestments", excerpt: c.company, problem: "FABRICATED_ENTITY", severity: "HIGH", explanation: "Not a Genesys investment in the firm's records. Removed automatically.", correction: "remove" });
    return false;
  });
  sanitized.portfolioFit.historicalPrecedents = memo.portfolioFit.historicalPrecedents.filter((c) => {
    if (known([...ctx.precedentNames, ...ctx.portfolioNames], c.company)) return true;
    add({ location: "portfolioFit.historicalPrecedents", excerpt: c.company, problem: "FABRICATED_ENTITY", severity: "HIGH", explanation: "Not among the precedents provided. Removed automatically.", correction: "remove" });
    return false;
  });

  // Internal consistency with the decision rules.
  const dims = memo.scorecard.map((s) => s.dimension);
  const missing = SCORE_DIMENSIONS.filter((d) => !dims.includes(d));
  if (missing.length || new Set(dims).size !== dims.length) {
    add({ location: "scorecard", excerpt: dims.join(", "), problem: "INTERNAL_INCONSISTENCY", severity: "MEDIUM", explanation: `Scorecard must score each dimension exactly once${missing.length ? `; missing: ${missing.join(", ")}` : ""}.`, correction: "Score all eight dimensions once." });
  }
  const score = (d: string) => memo.scorecard.find((s) => s.dimension === d)?.score ?? 0;
  if (memo.recommendation === "ADVANCE_TO_DILIGENCE" && (score("Science & Technology") < 7 || score("Genesys Strategic Fit") < 7)) {
    add({ location: "recommendation", excerpt: memo.recommendation, problem: "RULE_VIOLATION", severity: "HIGH", explanation: "Advancing requires Science & Technology ≥ 7 and Genesys Strategic Fit ≥ 7.", correction: "Change the recommendation or justify the scores." });
  }
  const band = memo.overallScore < 40 ? ["REJECT"] : memo.overallScore < 60 ? ["REJECT", "PENDING_INFO"] : memo.overallScore < 75 ? ["PENDING_INFO", "ADVANCE_TO_DILIGENCE"] : ["ADVANCE_TO_DILIGENCE"];
  if (!band.includes(memo.recommendation)) {
    add({ location: "overallScore", excerpt: `${memo.overallScore} → ${memo.recommendation}`, problem: "INTERNAL_INCONSISTENCY", severity: "LOW", explanation: "Score and recommendation fall outside the usual bands; the rationale must explain why.", correction: "Confirm the departure is explained." });
  }
  const sc = Object.fromEntries(memo.financials.returnScenarios.map((r) => [r.scenario, r]));
  const prob = memo.financials.returnScenarios.reduce((a, r) => a + (r.probability ?? 0), 0);
  if (prob > 1.05) add({ location: "financials.returnScenarios", excerpt: `probabilities sum to ${prob.toFixed(2)}`, problem: "INTERNAL_INCONSISTENCY", severity: "MEDIUM", explanation: "Scenario probabilities exceed 100%.", correction: "Rescale the probabilities." });
  if ((sc.BEAR?.grossMoic ?? 0) > (sc.BASE?.grossMoic ?? Infinity) || (sc.BASE?.grossMoic ?? 0) > (sc.BULL?.grossMoic ?? Infinity)) {
    add({ location: "financials.returnScenarios", excerpt: "MOIC ordering", problem: "INTERNAL_INCONSISTENCY", severity: "MEDIUM", explanation: "Bear ≤ Base ≤ Bull MOIC ordering is violated.", correction: "Correct the scenario returns." });
  }
  const email = `${memo.founderEmail.subject}\n${memo.founderEmail.body}`;
  if (/\b(score|scored|\/100|out of 100)\b/i.test(email) || /\b(AI|artificial intelligence|language model|chatgpt|claude)\b/.test(email)) {
    add({ location: "founderEmail", excerpt: email.match(/.{0,40}\b(score|scored|\/100|out of 100|AI|artificial intelligence|language model|chatgpt|claude)\b.{0,40}/i)?.[0] ?? "", problem: "RULE_VIOLATION", severity: "HIGH", explanation: "Founder correspondence must not reveal internal scores or mention AI.", correction: "Remove." });
  }

  // House style: phrasing that reads as machine-written.
  const emailHits = findBannedPhrases(email);
  if (emailHits.length) {
    add({ location: "founderEmail", excerpt: emailHits.join(", "), problem: "RULE_VIOLATION", severity: "MEDIUM", explanation: "Founder email uses phrasing outside the house writing standard.", correction: "Rewrite in plain business language." });
  }
  const memoHits = findBannedPhrases(JSON.stringify({ ...memo, founderEmail: undefined, evidence: undefined }));
  if (memoHits.length) {
    add({ location: "memo", excerpt: memoHits.join(", "), problem: "RULE_VIOLATION", severity: "LOW", explanation: "Memo uses phrasing outside the house writing standard.", correction: "Rewrite in plain business language." });
  }

  return { issues, quotesVerified, sanitized };
}

// ─── Independent model fact-check ───────────────────────────────────────────

export async function modelFactCheck(args: { memo: Memo; docs: ContentBlock[]; research: string | null; precedentsText: string | null }): Promise<Verification> {
  const { data } = await structuredCall({
    schema: VerificationSchema,
    effort: "high",
    maxTokens: 32000,
    content: [
      ...args.docs,
      {
        type: "text",
        text: [
          VERIFIER_PROMPT,
          args.research ? `\n## Web research (research brief and competitive sweep notes)\n${args.research}` : "\n## Web research\n(none)",
          args.precedentsText ? `\n${args.precedentsText}` : "",
          "\n## Memo to verify\n```json",
          JSON.stringify(args.memo),
          "```",
        ].join("\n"),
      },
    ],
  });
  return data;
}

export function summarise(
  automated: { issues: Issue[]; quotesVerified: number },
  model: Verification | null,
  memo: Memo,
  revisions: number,
): VerificationReport {
  const issues: Issue[] = [...automated.issues, ...(model?.issues ?? []).map((i) => ({ ...i, origin: "fact-checker" as const }))];
  const high = issues.filter((i) => i.severity === "HIGH").length;
  const medium = issues.filter((i) => i.severity === "MEDIUM").length;
  const decisionSupported = model?.decisionSupported ?? true;
  return {
    status: high > 0 || !decisionSupported || !model ? "FAILED" : medium > 0 ? "WARNINGS" : "PASSED",
    claimsChecked: model?.claimsChecked ?? 0,
    evidenceCount: memo.evidence.length,
    quotesVerified: automated.quotesVerified,
    decisionSupported,
    assessment: model?.assessment ?? "The independent fact-check could not be completed. Treat this memo as unverified.",
    issues,
    revisions,
    checkedAt: new Date().toISOString(),
  };
}

export function correctionsBlock(issues: Issue[]): string {
  return `## Corrections required by the independent fact-checker
Your previous draft of this memo failed verification. Rewrite the complete memo and fix every issue below:
- For an unsupported or fabricated claim, remove it, or restate it accurately with a correct source and an exact quote. You may also mark it NEEDS_VERIFICATION and turn it into an information request.
- Do not introduce any new unsourced claims.
- Re-check that the recommendation still follows from the verified evidence and the decision rules.

${issues.map((i, n) => `${n + 1}. [${i.severity} · ${i.problem}] ${i.location}: "${i.excerpt}". ${i.explanation} Correction: ${i.correction}`).join("\n")}`;
}

# AI analyst: model choice and design

## Model

The analyst uses **Anthropic Claude Opus 5.5** (`claude-opus-5-5`) through the Messages API.

| Requirement | Why Opus 5.5 fits |
|---|---|
| Reads full pitch decks, including charts, figures and tables | Native PDF and vision input: the model sees every slide as an image plus its text. Nothing is lost to OCR. |
| PhD-level critique of scientific data and MBA-level financial reasoning | Anthropic's most capable general-purpose model, with adaptive extended thinking. |
| Long context: deck + follow-ups + prior memos + firm history | 1M-token context window. |
| Machine-readable, consistent memos | Structured outputs (`output_config.format`) guarantee that every memo matches the schema in `src/lib/ai/schema.ts`. |
| Current information on competitors, trials and comparable deals | Server-side `web_search` / `web_fetch` tools, run before the memo is written. |
| Confidentiality | Commercial API terms exclude training on customer data. Documents are sent inline per request and are not stored with the provider. |

Configuration is in `.env`:
- `ANTHROPIC_MODEL` sets the model.
- `ANALYSIS_EFFORT` sets reasoning depth. The default is `high`; use `xhigh` or `max` for the deepest work, at more cost and latency.
- `ENABLE_WEB_RESEARCH` turns the web research stage on or off.

## Pipeline (`src/lib/ai/analyst.ts`)

1. **Ingest.** PDFs and images go to the model natively. PPTX (including speaker notes), DOCX and XLSX (including formulas) are converted to text on the server.
2. **Fingerprint.** A quick classification (sector, modality, indication, stage, tags) is used to retrieve precedents.
3. **Precedent retrieval** (`src/lib/training/retrieval.ts`).
   - Pulls the most similar past Genesys decisions from the deal archive, with the partners' rationale and the outcome.
   - Pulls any partner-endorsed exemplar memos for similar deals.
   - Each match carries a readable "why", and the precedents used are stored on the analysis.
4. **Research** (optional). Claude uses web search and fetch to compile a sourced brief covering founders, target validation, competitors, comparable deals, regulatory precedent, and contradictions with the deck.
5. **Underwriting.** One structured-output call produces the full memo plus an **evidence ledger**.
6. **Verification and correction** (`src/lib/ai/verify.ts`). Described below.
7. **Human sign-off.** An analyst attests to the memo. The founder email stays locked until they do.
8. **Follow-up rounds.** New materials create a new version. The analyst sees all documents, the prior memo and its history, and records what changed.

## Preventing hallucination

This is a high-stakes setting, so no single safeguard is trusted on its own.

| Layer | What it does |
|---|---|
| Grounding rules in the prompt | Every number, named entity and decision-relevant fact must appear in the evidence ledger. Each entry has a source type, a reference (file and page, or a URL from the research brief), a verbatim quote, and a status: verified / company claim / inference / needs verification. Background knowledge must be labelled and flagged. Gaps become information requests, not plausible-sounding filler. |
| Inline citations | Prose carries `[E4]`-style tags. The UI renders each as a chip that shows the claim, source and status on hover. |
| Code-level checks | Quotes are matched against the actual text of the documents (PDF text is extracted server-side) and of the research brief. URLs must come from the research brief. Cited Genesys companies must exist in the firm's records; fabricated ones are removed automatically. Decision, scores and scenarios must be internally consistent with the decision rules. The founder email must not reveal scores or mention AI. |
| Independent fact-check | A separate, adversarial model pass compares every claim and information request against the sources. It flags unsupported, contradicted, misquoted, fabricated, overstated or already-provided items, and judges whether the decision follows from the verified evidence. |
| Automatic correction | If HIGH or MEDIUM issues are found, the memo is rewritten once with the exact corrections required, then fully re-checked. |
| Human sign-off | The verification report (passed / warnings / failed, with every issue) is shown above the memo. An analyst must sign off, with a note whenever issues remain, before the founder email can be copied or sent. Sign-offs are audit-logged. |

## House writing standard

Memos and founder emails should read as if written by a senior associate at a top-tier life-science fund.
- **The prompt** sets the standard: plain, exact sentences; numbers with units and currency; and a ban on AI-associated phrasing ("delve", "landscape", "I hope this email finds you well", rule-of-three lists, and so on). The prompts themselves contain no em dashes, because models imitate the style they are given.
- **Every string the model returns** is passed through a sanitiser (`src/lib/ai/style.ts`) that removes em and en dashes. Numeric ranges become hyphens; clause dashes become commas.
- **The verifier flags** any banned phrasing that remains.

## How the model becomes *Genesys'* analyst

Claude cannot be fine-tuned through the public API. Firm-specific expertise comes from the layers below, all managed in the **Training Studio**:

1. **Analyst profile.** A life-sciences PhD with an MBA. The prompt includes:
   - modality-specific diligence checklists
   - phase-transition benchmarks
   - Canadian reimbursement and funding context
   - an anchored 1–10 rubric for each scorecard dimension
   - explicit decision rules
2. **Firm parameters** (Training Studio → Prompt & parameters). Cheque size, ownership target, reserves, return hurdle, mandate, screening bar and correspondence style, all edited by partners.
3. **Investment principles.** Standing rules that every memo applies. Each conflict is flagged.
4. **Deal archive.** Past Genesys decisions (invested, passed after diligence, declined at screen), with rationale, outcome and original decks. Imported in bulk from CSV and retrieved as precedent.
5. **Exemplar memos.** Partner-corrected memos, endorsed as the standard to emulate.
6. **Calibration.** Partner reviews of each memo feed into every analysis. The studio also mines them for recurring patterns and drafts new principles for partners to adopt.
7. **Backtests.** Replay the analyst on archived deals using only the original deck and only earlier precedents. It reports:
   - agreement with Genesys' real decisions
   - a confusion matrix
   - missed winners and false advances
   - bias and per-sector accuracy

   Re-run after each change to see whether it helped.
8. **Dataset export** (JSONL). Everything above, structured for training a Genesys-owned open-weight model as a second opinion once about 300 examples exist.

Everything sent to the model can be read in full under Training Studio → Prompt & parameters.

## Reliability

- **Server-side refusal fallback** (`fallbacks: "default"`): if a safety classifier declines a request, it is re-run on Anthropic's recommended fallback model within the same call.
- **Async execution.** Analyses run in the background after the upload request returns. The deal page polls for progress.
- **Restart recovery.** Analyses interrupted by a server restart are marked failed on startup (`src/instrumentation.ts`) so they can be re-run with one click.
- **Truncation and refusal handling.** Both are surfaced to the user rather than written into the database as partial memos.

## Indicative cost

A typical first screen is a 30–40 page deck, a web-research pass, the memo and an independent fact-check (plus a correction round when needed). At Opus 5.5 list prices ($4 / $20 per million tokens) that is about **US$2–5 per memo**. Follow-ups cost about the same. At 500 decks a year, model spend is a few thousand dollars.

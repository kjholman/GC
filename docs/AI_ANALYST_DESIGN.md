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
2. **Research stage** (optional).
   - Claude uses web search and fetch to compile a sourced brief covering: founders, target validation, competitive landscape, comparable financings and M&A, regulatory precedent, and anything that contradicts the deck.
   - Follow-up rounds reuse the existing brief.
3. **Underwriting stage.** One structured-output call produces the full memo:
   - Decision: Decline, Request information, or Advance to diligence.
   - A "worth our time" verdict, executive summary, and an 8-dimension scorecard with evidence.
   - Science, clinical/regulatory, IP, market, team, and financials, with Bear/Base/Bull return scenarios.
   - Portfolio fit and comparable Genesys investments.
   - Information requests.
   - A **due-diligence plan, issued only when the deal advances**. This is enforced in the prompt and again in code (`normaliseMemo`).
   - A ready-to-send founder email.
4. **Follow-up rounds.** New materials create a new memo version. That run sees every document from every round, the full previous memo and the version history. The model re-checks each outstanding request and explains what changed in `versionDelta`.

## How the model becomes *Genesys'* analyst

Claude cannot be fine-tuned through the public API. Firm-specific expertise comes from the four layers below, all applied on every call. In practice this is more controllable than fine-tuning, because partners can see and edit every layer.

1. **Persona and analytical toolkit** (`src/lib/ai/prompts.ts`).
   - The analyst is defined as a life-sciences PhD with an MBA and investment training.
   - The prompt spells out the PhD-level checklists: data quality, translational validity, and modality-specific diligence for small molecules, biologics, cell and gene therapy, radiopharma, devices and diagnostics.
   - It also spells out the MBA-level frameworks: rNPV, comparables, capital-to-inflection, dilution and MOIC, and term structure.
   - It carries the Genesys investing model: co-creation, pre-seed to Series A, Canadian focus, and medtech plus biotech.
2. **Investment principles** (Knowledge base → Investment principles). These are standing rules written by the partners. Every memo applies them and flags any conflict.
3. **Institutional memory.**
   - The Genesys portfolio, with outcomes and lessons, is benchmarked in every memo.
   - The platform's recent screening decisions keep scoring consistent over time.
4. **Partner calibration loop.**
   - Partners mark each memo as agree / too optimistic / too pessimistic / wrong decision, and explain why.
   - The 40 most recent critiques are added to every future analysis, with an instruction to learn the pattern.
   - Over time, this is how the analyst converges on the partnership's judgement.

Prompt caching keeps this cheap: the firm profile is cached for 1 hour, and institutional memory is cached separately.

## Reliability

- **Server-side refusal fallback** (`fallbacks: "default"`): if a safety classifier declines a request, it is re-run on Anthropic's recommended fallback model within the same call.
- **Async execution.** Analyses run in the background after the upload request returns. The deal page polls for progress.
- **Restart recovery.** Analyses interrupted by a server restart are marked failed on startup (`src/instrumentation.ts`) so they can be re-run with one click.
- **Truncation and refusal handling.** Both are surfaced to the user rather than written into the database as partial memos.

## Indicative cost

A typical first screen is a 30–40 page deck plus a web-research pass. Input is roughly 60–150k tokens; output is roughly 20–50k tokens, including billed reasoning. At Opus 5.5 list prices ($4 / $20 per million tokens) that is about **US$1–3 per memo**. Follow-ups cost about the same. At 500 decks a year, model spend is a few thousand dollars.

# AI analyst: architecture and design

GAIA calls Anthropic's Claude models through the Messages API. The models are Anthropic's; GAIA does not host, own or train them. Every request is standalone: the model sees only what GAIA sends with that request and keeps nothing afterwards. Everything firm-specific lives in GAIA's own database and is added to each request as written context.

## Models

| Step | Model | Why |
|---|---|---|
| Memo, correction and fact-check | Claude Opus 5.5 (`ANTHROPIC_MODEL`) | Judgement: scientific critique, financial reasoning, decision rules. Native PDF and vision input, so every slide is seen as an image plus its text. 1M-token context. |
| Reading the materials, web research, competitor table, knowledge extraction, feedback lessons, JSON repair | Claude Sonnet 5.5 (`ANTHROPIC_FAST_MODEL`) | Mechanical work at a lower price |

Configuration (`.env`):
- `ANTHROPIC_MODEL`, `ANTHROPIC_FAST_MODEL`: the two models.
- `ANALYSIS_EFFORT`: reasoning effort for the memo (`low` to `max`, default `medium`). Other steps set their own effort.
- `ENABLE_WEB_RESEARCH`: turns the web research and competitor sweep on or off.

## Request settings (`src/lib/ai/client.ts`)

- `POST /v1/messages`, always streamed, through the official TypeScript SDK (`@anthropic-ai/sdk`). 20-minute timeout per call, up to 3 automatic retries.
- Adaptive extended thinking on every call; effort set per step.
- Smaller steps use strict structured output (`output_config.format`, built from the Zod schemas in `src/lib/ai/schema.ts`). The memo schema is too large for strict mode, so the memo is requested as JSON, parsed leniently, validated against the schema, and repaired by a low-effort Sonnet call if malformed.
- Server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`): if a safety classifier declines a request, Anthropic re-runs it on its recommended fallback model within the same call.
- Every string the model returns passes through the house-style sanitiser (`src/lib/ai/style.ts`).

## Pipeline (`src/lib/ai/analyst.ts`)

1. **Prepare the files** (`src/lib/ai/files.ts`). Word, PowerPoint (with speaker notes) and Excel (with formulas) become text on the server. PDFs and images are sent inline until a request's files reach 12 MB; beyond that they go through Anthropic's Files API with a 24-hour expiry and are deleted when the analysis finishes. PDFs over 600 pages are read as text. The document budget is about 650,000 tokens; lower-priority files are read as text or excerpted first, and the memo says which files were not read in full.
2. **Profile and dossier** (Sonnet, effort low). Company name, sector, modality, indication, tags, website, and a 500 to 900 word factual dossier. Stored on the deal and reused until the set of files changes.
3. **Precedents** (`src/lib/training/retrieval.ts`, no model call). The most similar past Genesys decisions and partner-endorsed example memos, each with a readable reason for the match.
4. **Web research** (Sonnet, effort medium, in parallel). Five passes, each given the dossier rather than the files: science and regulatory; founders and management (public professional information only); intellectual property; market and epidemiology; company track record. Each pass may make up to 8 searches and 5 page reads (8,000 tokens per page).
5. **Competitor sweep** (Sonnet, with the dossier). Up to 15 searches and 8 page reads covering companies doing the same thing, their funding rounds, investors and outcomes, then a strict extraction into a table. Companies whose sources are not in the research notes are dropped. Research and the sweep are stored on the deal and reused on later versions for up to 30 days.
6. **Memo** (Opus, effort `ANALYSIS_EFFORT`, up to 64,000 output tokens). The full memo plus an evidence ledger tying each claim to a source.
7. **Fact-check and correction** (`src/lib/ai/verify.ts`). Code-level checks, then an independent Opus review. Serious issues trigger one rewrite and a second check (see below).
8. **Human sign-off.** A partner reviews and signs off. The founder email stays locked until they do.
9. **Later versions.** New materials, or a re-run with a reason, create a new version that sees every document received and a digest of the previous memo, and records what changed.

## Context management: what the model receives

Each request carries only what that step needs. What is tailored to the deal is chosen by relevance, using the same similarity scoring as precedent retrieval (sector, modality, indication and themes, with synonyms).

| Part of the context | What is sent | How it is kept lean |
|---|---|---|
| Fixed instructions | Analyst profile, methodology, scoring rubric, decision rules | Same for every analysis; cached for 1 hour |
| Deal files | The uploaded materials | About 650,000 tokens at most, with lower-priority files read as text or excerpted first |
| Company dossier | 500 to 900 words extracted once from the files | The research passes and competitor sweep get this instead of the files |
| Firm rules | Firm settings, investment principles, funding stages | Always in full: short, and they apply to every deal |
| Portfolio | The 10 companies most similar to the deal in full; every other company by name, sector and outcome | Portfolio fit and conflict checks still see the whole portfolio |
| Partner feedback | Up to 20 lessons: the 12 most relevant (lessons for all deals count as relevant) plus the most recent | Firm-wide patterns stay visible without every review |
| Past decisions on the platform | Up to 20: the 12 most similar deals plus the most recent | Keeps scoring consistent with similar deals |
| Precedents and example memos | The closest matches from the Training Studio | Chosen by similarity |
| Earlier versions (re-runs and follow-ups) | A digest of the last memo: verdict, conviction, scores, reasons, red flags, risks, founder requests, open gaps, valuation view; plus the team's feedback on earlier versions | The previous memo is no longer sent in full; the new memo is rewritten from the documents |
| Firm documents | Summaries of uploaded strategy and fund documents | Trimmed step by step if the firm context passes about 30,000 tokens |

The firm context is built by `buildFirmContext()` with the deal's profile as its focus. Without a focus (the Firm settings page, accuracy tests) it includes everything, subject to the same size budget.

**Prompt caching.** Only the fixed instructions are cached. A cache write costs more than ordinary input (1.25x for 5 minutes, 2x for 1 hour) and a cache read a tenth. Each set of files and each deal's firm context is used at most once per analysis (the memo and the fact-check send different instructions ahead of the files, so they cannot share a cache entry), so caching them would raise the cost.

**Removed files.** When a file is removed from a deal, the deal's dossier and stored research are cleared, earlier versions are not passed on, and a paused analysis drops work saved while the file was there. The next analysis rebuilds everything from the remaining files.

**Measuring.** Every response's usage is written to `AiUsage`: model, step, input tokens, cache-read and cache-write tokens, output tokens and cost. Administration → Costs shows spend per analysis and a "Where the tokens go" table by step (requests, average input and output, share served from cache, cost, share of spend).

## Preventing hallucination

No single safeguard is trusted on its own.

| Layer | What it does |
|---|---|
| Grounding rules in the prompt | Every number, named entity and decision-relevant fact must appear in the evidence ledger, with a source type, a reference (file and page, or a URL from the research), a verbatim quote, and a status: verified, company claim, inference or needs verification. Gaps become information requests, not plausible-sounding filler. |
| Inline citations | Prose carries `[E4]`-style tags, shown in the UI as chips with the claim, source and status. |
| Code-level checks | People profiled must be named in the materials or research. Patent numbers must appear in a source. Market sizing must be arithmetically consistent. Quotes are matched against the document text and the research (exactly, or at least 85% of 6-word runs). URLs must come from the research. Cited Genesys companies must exist in the firm's records. Decision, scores and scenarios must agree with the decision rules. The founder email must not reveal scores or mention AI. |
| Independent fact-check | A separate Opus pass compares every claim and information request against the sources and judges whether the decision follows from the verified evidence. |
| Automatic correction | If serious issues are found, the memo is rewritten once with the exact corrections required, then checked again. Remaining issues are shown on the memo. |
| Human sign-off | The verification report is shown above the memo. A partner signs off, with a note if issues remain, before the founder email can be used. Sign-offs are audit-logged. |

## House writing standard

Memos and founder emails should read as if written by a senior associate at a top-tier life-science fund.
- **The prompt** sets the standard: plain, exact sentences, numbers with units and currency, and a ban on AI-associated phrasing. The prompts contain no em dashes, because models imitate the style they are given.
- **The sanitiser** (`src/lib/ai/style.ts`) removes em and en dashes from every string the model returns.
- **The fact-check flags** banned phrasing that remains.

## How the model becomes Genesys's analyst

Claude is not fine-tuned. Firm-specific expertise comes from context, managed in the Knowledge base and the Training Studio:

1. **Analyst profile.** Modality-specific diligence checklists, phase-transition benchmarks, Canadian reimbursement and funding context, an anchored 1 to 10 rubric for each scorecard dimension, and explicit decision rules.
2. **Firm settings** (Training Studio → Firm settings). Cheque size, ownership target, reserves, return hurdle, mandate, screening bar and correspondence style.
3. **Funding stages** (Training Studio → Funding stages). Cheque, round size, valuation, ownership, evidence and milestones expected at each stage; each deal is benchmarked against its stage.
4. **Investment principles** (Knowledge base). Standing rules every memo applies, with conflicts flagged.
5. **Portfolio** (Knowledge base). Companies, terms, outcomes and lessons, used to judge fit and to recognise follow-on decisions.
6. **Past deals** (Training Studio). Past decisions with rationale, outcome and original decks, retrieved as precedent.
7. **Example memos.** Partner-corrected memos, endorsed as the standard to follow.
8. **Partner feedback.** Reviews of each memo become lessons applied to later analyses; recurring patterns are drafted into suggested principles.
9. **Accuracy tests.** Replay the analyst on past decks (profile and memo steps, without web research) and report agreement with the real decisions, missed winners, false advances, bias and per-sector accuracy.
10. **Dataset export** (JSONL), for evaluating or training a separate model later.

The full instructions and the current firm context can be read under Training Studio → Firm settings.

## Reliability

- **Background execution.** Analyses run in the same process after the request returns (Next.js `after()`); the deal page polls for progress.
- **Checkpoints.** Each finished stage (research pass, sweep, draft memo, fact-check) is saved to `Analysis.checkpoint`. A resumed or restarted run skips finished work.
- **Work in progress** (`src/lib/ai/partial.ts`). While a step streams its answer, the text written so far is saved to `checkpoint.partial[step]` every 5 seconds, and cleared when the request ends. If the server stops mid-step, the resumed step sends that text back to the model ("continue from exactly the next character") and joins the continuation on. Claude Opus 5.5 and Sonnet 5.5 don't accept assistant prefill, so the text goes back as context. For steps with a strict output format, the model rewrites the full answer from its own draft. If the joined answer doesn't parse, the model's own output is used, then the JSON repair, so a bad join never costs the analysis.
- **Restart recovery** (`src/instrumentation.ts`). On start-up, every interrupted analysis is resumed immediately, however long ago it began, reusing finished stages and continuing the step that was cut off. One that has already been resumed after 3 restarts is stopped with a message instead (`checkpoint.resumes`), so an analysis that keeps crashing the server cannot loop.
- **Out of credit.** A credit or billing error pauses the analysis instead of failing it; it resumes when credit is back.
- **Server logs** (`src/lib/logs/`). Everything the server writes to its console is also saved to the `AppLog` table: time, level, source (from the `[tag]` at the start of the line), message and, for lines written during an analysis, the analysis. Lines are batched once a second; API keys, bearer tokens and passwords in connection strings are masked before saving; lines are capped at 16,000 characters and deleted after `LOG_RETENTION_DAYS` (default 30). Administrators read them live under Administration → Server logs, or from `GET /api/logs/stream` (Server-Sent Events: the last 200 lines, then each new line; filters `level`, `source`, `q`, `analysis`; reconnects resume from `Last-Event-ID` without gaps) and `GET /api/logs` (JSON history, paged with `before` and `after`).
- **Truncation and refusals** stop the run with a plain message rather than saving a partial memo.

## Data handling at Anthropic

- Anthropic's commercial terms: no training on customer content.
- Inputs and outputs are deleted within 30 days by default (exceptions: Files API storage until deleted, Usage Policy enforcement, legal requirements).
- Files sent through the Files API expire after 24 hours and GAIA deletes them as soon as the analysis finishes.
- The web search version used runs inside Anthropic's code-execution sandbox, whose data is kept up to 30 days.
- **Processing location: United States only** (`src/lib/ai/region.ts`). Every request to the Messages API sets `inference_geo: "us"`, so the model runs only on Anthropic's US infrastructure. Anthropic offers only "us" and "global"; there is no Canadian option. Each response reports where it ran (`usage.inference_geo`), and anything other than "us" stops the work. US-only processing costs 1.1 times the standard rate, which cost reports and estimates include.
- **Storage location.** Files sent through the Files API, and code execution used by web research, follow the Anthropic workspace's "workspace geo", which is set when the workspace is created and is currently always "us". In the Anthropic Console (Settings → Data residency), the workspace behind GAIA's API key should allow only the "us" inference geo and default to it, so that any request without it is refused.
- Web search and web fetch send search queries and fetch public pages on GAIA's behalf; the documents themselves are not sent to search providers. Anthropic's data residency page does not state where those searches run.

## Cost

**Projected cost before every run** (`src/lib/ai/estimate.ts`). A new analysis (first screen, new information or re-run) waits on the deal page with its projected cost and a breakdown by step. It starts only when someone ticks "I understand this analysis is projected to cost about US$X" and presses Run; "Don't run" cancels it at no cost. The projection uses the size of this deal's materials (read the same way the analysis reads them), what can be reused (company profile, web research under 30 days old, competitor sweep), current model prices including the US-only rate, and, once enough analyses have run, the firm's own history: average output per step, research cost, how often the memo needs correcting, and how far past projections were from actual costs. If the materials change before confirming and the projection rises, the person is asked to confirm the new figure. The confirmed projection is saved with the analysis next to its actual cost. Resuming a paused analysis shows the projected cost of the remaining work.

**AI credit limits** (`src/lib/credits/`). The administrator (`ADMIN_EMAIL`) can give each person an allowance in US$, add credit, refill it, take the limit off, or switch a person's AI work off. Spend counts against the person who confirmed or started the work. GAIA checks the allowance before every AI request: analyses pause (with nothing lost) when it runs out and carry on by themselves when credit is added; other AI tasks are refused with a plain message. A request already under way finishes, so the last one can take spending slightly past the allowance. The administrator's own use is never limited. Administration → AI credit limits shows everyone's allowance, use and spending, and a report per person (spending by month, by purpose, recent work, and every change to their allowance).

The actual cost of every analysis is measured, not estimated: see Administration → Costs, including the per-step breakdown. Web search is billed at about US$10 per 1,000 searches. Later versions reuse research less than 30 days old, so they cost less than a first screen.

## Hosting on Azure (planned)

The same pipeline can call Claude through Microsoft Foundry (Hosted on Azure, US Data Zone) instead of Anthropic's API. That needs Anthropic's Foundry client with the app's managed identity, a client-side refusal fallback (server-side fallback is not offered there), the basic web search and fetch tool versions, and large files sent as text (the Files API is not offered there). See the Azure deployment walkthrough.

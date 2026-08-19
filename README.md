# Preflight AI ✈️

**Know your AI bill before you run it.**

![Node](https://img.shields.io/badge/node-%E2%89%A522.5-brightgreen) ![React](https://img.shields.io/badge/react-18-blue) ![Tests](https://img.shields.io/badge/tests-passing-brightgreen) ![Pricing](https://img.shields.io/badge/pricing%20data-July%202026%20verified-informational)

Describe a task in plain language ("summarize 500 support tickets a day"), and Preflight forecasts token usage, monthly cost, expected quality, and time-per-task across every major AI platform (Claude, GPT, Gemini, DeepSeek, Grok, Groq) — **before you spend a dollar**.

Every estimate ships three numbers, never one: **P50** (expect it) / **P90** (budget it) / **blowout** (cap at it) — because AI agents burn 5–30× the tokens anyone plans for, and single-number estimates are structurally dishonest.

![Preflight AI demo](docs/demo.gif)

> 🎬 Higher-quality video: [docs/demo.mp4](docs/demo.mp4) · 📣 Launch copy for releases/posts: [GITHUB_LAUNCH.md](GITHUB_LAUNCH.md)

## Structure

```
preflight-app/
├── server/            Node/Express API
│   ├── index.js           API entry (serves client build in production)
│   ├── lib/estimator.js   Estimation engine (classification → token model → pricing → quality/time → variance)
│   ├── lib/approvals.js   Budget-approval workflow (SQLite via node:sqlite)
│   ├── lib/signoffDoc.js  Printable one-page sign-off document
│   ├── data/models.json   Pricing + performance seed data (verified July 2026)
│   └── test/          Unit tests (node --test test/*.test.js)
└── client/            React + Vite frontend
```

## Run it

Requires **Node ≥ 22.5** (the approval workflow uses the built-in `node:sqlite` module).

```bash
# 1. API
cd server && npm install
export ANTHROPIC_API_KEY=sk-ant-...          # optional — see Classification below
npm start                                    # http://localhost:3001

# 2. Frontend (separate terminal)
cd client && npm install && npm run dev      # http://localhost:5173 (proxies /api)
```

Production: `cd client && npm run build`, then `cd server && npm start` serves everything on :3001.

## Tests

```bash
cd server && npm test
```

## API

- `GET /api/models` — pricing/performance table
- `POST /api/estimate` — body: `{ description, tasksPerMonth, avgInputWords, cacheHitRate (0–1), batch (bool), fileSnippet? }`. `fileSnippet` (from `/api/extract-text`, see below) is a bounded excerpt of an uploaded file used as extra context for classification only — it doesn't change the response shape.
- `POST /api/extract-text` — multipart form upload, field name `file` (max 5MB). Extracts text server-side (plain text/code pass through directly; PDF via `pdf-parse`, DOCX via `mammoth`, XLSX/XLS via a small in-house extractor — see `server/lib/fileExtract.js` for why not a spreadsheet library) and returns `{ fileName, wordCount, charCount, preview, snippet }`. The file is processed in memory and never written to disk. Use `wordCount` to set `avgInputWords` accurately instead of guessing, and pass `snippet` as `fileSnippet` on `/api/estimate` for better task-type classification.
- `POST /api/estimate-workflow` — body: `{ steps: [{ description, avgInputWords }], tasksPerMonth, cacheHitRate, batch }`. Chain-aware: each step's input carries all previous steps' outputs (context accumulation). Returns per-step token breakdown, full comparison table, and a `mixedPlan` — the cheapest per-step model mix at quality ≥ 85, with savings vs running everything on the top model.
- `GET /api/code-tasks` — available coding task kinds
- `POST /api/estimate-code` — body: `{ taskKind?, description?, language, codebaseSize (small|medium|large), tasksPerMonth, cacheHitRate, batch, fileWordCount?, fileSnippet? }`. Provide either an explicit `taskKind` (bugfix|feature|refactor|tests|review|greenfield) or a plain-language `description` — the latter is classified into a `taskKind` server-side (Claude when `ANTHROPIC_API_KEY` is set, heuristic keyword fallback otherwise; `fileSnippet` adds context). Models agentic coding loops (re-reading context, running tests, retrying) per task kind. `fileWordCount` (from `/api/extract-text` or `/api/extract-project`) replaces the fixed per-task-kind input-token seed with the uploaded code's real size; `codebaseSize` still scales on top of it (surrounding files not in the upload). Response includes `results` (raw API models, same shape as `/api/estimate`) plus `codingTools` — coding-agent products (Claude Code, Codex CLI, GitHub Copilot, Cursor) priced as flat monthly seats. Each entry carries `apiEquivalentMonthlyCost` (what the same token volume would cost metered through the tool's underlying model) and a `quota` object (`windowHours`, `windowLabel`, `utilizationPct`, `seatsNeeded`, `hoursUntilQuotaExhausted`) estimating how much of the plan's rolling usage window your volume would consume and how many seats you'd need to avoid getting capped. Quota sizes are heuristic assumptions — providers rarely publish exact token-equivalent limits.
- `POST /api/extract-project` — multipart form upload for a whole folder/project: field `files` (repeated, max 500 files / 5MB each / 20MB combined) plus a companion field `paths` — a JSON array of each file's relative path, same order as `files` (multipart/form-data can't carry a `/`-containing filename on the file part itself, so paths travel separately). Junk paths (`node_modules`, `.git`, `dist`, `build`, etc.) and unsupported extensions are skipped, not errored. Returns `{ fileCount, skippedCount, failedCount, totalWordCount, totalCharCount, files: [{fileName, wordCount}], skipped, failed, snippet }`. Use `totalWordCount` as `fileWordCount` and `snippet` as `fileSnippet` on `/api/estimate-code`.

### Approval workflow & guardrail export (paused)

The budget-approval workflow (`server/lib/approvals.js`, `server/lib/signoffDoc.js`) and guardrail config export (`server/lib/guardrailConfig.js`) are fully built and tested, but not currently mounted in `server/index.js` or exposed in the UI — paused pending a decision on how to scale the SQLite-backed persistence. Run `npm test` in `server/` to see them still pass against their own test suites. See `ROADMAP.md` for the re-enable plan.

## How estimation works

1. **Classify** the description into a task profile (coding, summarization, extraction, chat, writing, translation, RAG, agentic).
2. **Token model** — each profile has empirical input/output token seeds; doc-based tasks scale with input size; agentic tasks apply a round-trip multiplier.
3. **Price** monthly tokens against each model's verified rates (incl. cached-input and batch discounts).
4. **Score** quality per task category and estimate time from latency + tokens/sec.

Estimates carry a ±35% uncertainty band. Roadmap: calibrate token models against real usage (see business plan).

### Variance & risk

Every model result carries `scenarios: { p50, p90, blowout }` alongside the existing `monthlyCost.{low,mid,high}` range. Task types are assigned a risk tier (`RISK_TIERS` in `estimator.js`) reflecting how much their real-world cost varies from the median: deterministic tasks like extraction/translation cluster tightly (P90 ≈ 1.3× median), while agentic/coding tasks have a fat right tail from retries and re-read context (P90 up to 4×, blowout up to 30×). The top-level `risk` object on each response includes a `warning` for high/very-high tiers. Budget to P90; treat blowout as the ceiling a spending cap should survive.

### Classification

`server/lib/estimator.js` classifies each description with the Claude API (`claude-haiku-4-5`, forced tool-call for structured output) when `ANTHROPIC_API_KEY` is set. Without a key, or if the API call fails, it falls back to the original keyword-scoring heuristic (`classifyTaskHeuristic`) — so the app degrades gracefully rather than failing. Override the model with `PREFLIGHT_CLASSIFIER_MODEL`.

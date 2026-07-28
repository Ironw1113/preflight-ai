# Preflight AI — project context

## What this is
Preflight AI is **the pre-approval layer for AI spend**: describe an AI task, workflow, or coding job, and get variance-honest cost forecasts (P50/P90/blowout) across all major AI platforms *before* any money is spent. Positioning and strategy live in `../Preflight-AI-Business-Plan-v2.docx`. Category framing: we **predict and pre-approve** spend; observability tools (Helicone, Langfuse) only watch it after the fact. The four-stage product loop is Predict → Approve → Enforce → Learn.

## Non-negotiable product principles
1. **Variance honesty is the brand.** Never present a single point estimate. Every cost surfaces P50 / P90 / blowout, with risk tiers per task type (see `RISK_TIERS` in the estimator). CFO guidance: budget to P90, cap at blowout.
2. **Graceful degradation.** Everything must work without an API key (heuristic fallbacks). `ANTHROPIC_API_KEY` upgrades classification to Claude; its absence must never break anything.
3. **Estimates are labeled heuristic** until calibrated against real usage. The calibration dataset (predicted vs actual) is the long-term moat.

## Architecture
- `server/` — Node/Express API.
  - `lib/estimator.js` — all estimation logic: task profiles, token math, `RISK_TIERS`/`TASK_RISK` variance system, `modelResults()` shared pricing core, `estimate()`, `estimateWorkflow()` (context accumulation: each step's input carries all previous outputs), `estimateCode()` (agent-loop multipliers), `estimateCodingTools()` (flat-seat subscriptions with quota/seat math).
  - `lib/approvals.js` — the "Approve" stage. SQLite persistence via Node's built-in `node:sqlite` (`DatabaseSync`, requires Node >=22.5 — this is why `render.yaml`'s `NODE_VERSION` and `server/package.json`'s `engines.node` are pinned above that; no external DB dependency). `createApproval()` re-runs the matching estimator server-side rather than trusting a client-supplied result, so the stored snapshot is authoritative. DB file at `server/data/preflight.db` (gitignored, ephemeral on Render's free-plan filesystem — fine per the "no accounts yet" phase; revisit if persistence across deploys matters before auth ships).
  - `lib/signoffDoc.js` — renders the one-page approval sign-off as print-optimized HTML (`GET /api/approvals/:id/print`); users hit the browser's own Print -> Save as PDF rather than us shipping a PDF-generation dependency. Sets `color-scheme: light` explicitly — omitting it let browser dark-mode inversion turn the dark-on-white text unreadable.
  - `lib/guardrailConfig.js` — the "Enforce" stage. Generates LiteLLM `config.yaml` (hard `max_budget` = blowout cap; 80%/100% alert thresholds off the approved P90 budget), Portkey budget JSON, and a generic webhook JSON from an approved request, via `GET /api/approvals/:id/guardrails/:format` (400 unless `status === "approved"`; `?download=1` sets `Content-Disposition: attachment`). Only uses LiteLLM/Portkey field names we're confident are current — anything else ships as a comment with a "verify before applying" disclaimer, since those are real third-party tools whose schemas evolve independently of this app.
  - `data/models.json` — verified per-1M-token pricing + heuristic quality/speed scores. Update prices here only, from official provider pages.
  - `test/*.test.js` — run with `npm test` (globs all `test/*.test.js`). Tests delete `ANTHROPIC_API_KEY` to force deterministic heuristic paths; `approvals.test.js` uses `resetDbForTests(":memory:")` for isolation. Keep all tests passing; add tests for any estimator/approvals change.
- `client/` — React + Vite. `src/Landing.jsx` is the marketing homepage (hero, variance explainer, Predict→Approve→Enforce→Learn, features, pricing, footer) plus the shared sticky `SiteNav`; `src/App.jsx` holds the estimator app with four mode tabs (Single task / Multi-step workflow / Code estimator / Approvals). Routing is dependency-free hash routing in App's default export: `#/app` → estimator, anything else → landing. `ApprovalRequestForm` renders on every results view and posts to `/api/approvals`; `ApprovalsMode` is the audit-trail list with approve/reject actions. Dark theme + Inter font in `src/styles.css` (landing styles prefixed: `.hero`, `.sitenav`, `.tier-card`, etc.). Dev server proxies `/api` to :3001.
- Deployed on Render (`render.yaml`).

## Conventions
- Plain CommonJS on the server, no TypeScript, no new dependencies without good reason.
- API responses stay backward compatible: keep `monthlyCost.{low,mid,high}` alongside `scenarios.{p50,p90,blowout}`.
- Quality scores are 0–100 heuristic seeds; don't present them as benchmark results.

## Working state
See `ROADMAP.md` for prioritized next work agreed in planning sessions.

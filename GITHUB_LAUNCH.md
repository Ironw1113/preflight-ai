# GitHub launch kit

Everything you need to publish the repo. Copy each block into the right place on GitHub.

---

## 1. Repo settings

**Description (the one-liner under the repo name):**

> ✈️ Know your AI bill before you run it. Task-based cost forecasting across Claude, GPT, Gemini & more — with honest P50/P90/blowout variance instead of one fake-precise number.

**Website:** your Render URL

**Topics (Settings → add topics):**

```
llm  ai-cost  finops  token-usage  cost-estimation  llm-pricing  anthropic  openai  gemini  react  nodejs  ai-budgeting
```

---

## 2. Release post (Releases → Draft a new release → tag `v0.1.0`)

**Title:** `v0.1.0 — Preflight AI: the pre-approval layer for AI spend`

**Body:**

AI agents burn **5–30× the tokens anyone plans for**, 80% of enterprises miss their AI cost forecasts by more than 25%, and most teams find out from the invoice. Every pricing tool on the market asks "how many tokens will you use?" — which is precisely the number nobody knows.

**Preflight answers the question companies actually ask: what will this task cost me, on which platform, and how confident can I be in that number?**

![demo](docs/demo.gif)

### What's in this release

🔮 **Three estimators, one plain-language input**
- **Single task** — describe any AI task ("summarize 500 support tickets a day"); get per-model tokens, monthly cost, quality score, and time-per-run across 15+ models (Claude, GPT, Gemini, DeepSeek, Grok, Groq)
- **Multi-step workflow** — chain-aware math where each step carries the context of the ones before it (the accumulation that makes real pipelines expensive), plus a **mixed-model plan**: the cheapest model per step at quality ≥ 85 — routinely 90%+ cheaper than running everything on the flagship
- **Code estimator** — bug fix to greenfield, with agent-loop multipliers by task kind, language, and codebase size — compared across both raw APIs *and* coding-agent subscriptions (Claude Code, Codex CLI, Copilot, Cursor) with seat/quota math

📊 **Variance honesty — the core idea**
Every result ships three numbers, never one:
- **P50** — the median month. Expect it.
- **P90** — 9 in 10 months land at or below. Budget it.
- **Blowout** — the runaway-agent scenario (up to 30× for agentic work, matching measured production variance). Cap at it.

📎 **Real-file grounding** — upload a document or an entire project folder; estimates use its actual word/token counts instead of guesses

🧠 **Claude-powered task classification** with a zero-dependency heuristic fallback — the whole app works without any API key

✅ 60+ unit tests, verified July 2026 pricing from official provider pages, single-command deploy (Render config included)

### Honest limitations

Token models and quality scores are heuristic seeds, clearly labeled as such, until calibrated against real usage — the ±35% bands and risk tiers exist precisely because single-number estimates are structurally dishonest. Calibration against actuals is the roadmap's centerpiece (see `ROADMAP.md`).

### Quick start

```bash
cd server && npm install && npm start     # API on :3001
cd client && npm install && npm run dev   # UI on :5173
```

Requires Node ≥ 22.5. No API key needed.

---

## 3. Short version (for a Discussion post, tweet, or Show HN)

**Title:** Show HN: Preflight AI — know your AI bill before you run it

I kept reading that companies can't predict AI costs — agents burn 5–30× the tokens anyone budgets, and 80% of enterprises miss their AI forecasts by >25%. Every existing calculator asks "how many tokens?", which is exactly the number nobody knows.

So I built Preflight: describe a task in plain language ("summarize 500 support tickets a day", "fix bugs in a large TypeScript codebase") and it forecasts tokens, cost, quality, and time across 15+ models — Claude, GPT, Gemini, DeepSeek, coding-agent subscriptions with their seat quotas, all of it.

The part I care most about: it never shows one number. Every estimate is P50 / P90 / blowout, because AI cost variance is the actual problem — you expect the median, budget the P90, and cap at the blowout scenario. Multi-step workflows model context accumulation (each step re-reads previous outputs), and it'll suggest a per-step model mix that's routinely 90% cheaper than running everything on a flagship model.

Node + React, runs locally with zero API keys, MIT licensed. Estimates are heuristic seeds — honestly labeled — until the calibration loop lands. Feedback very welcome, especially real predicted-vs-actual numbers.

---

## 4. Suggested first commit message for the launch

```
Launch v0.1.0: task-based AI cost forecasting with P50/P90/blowout variance

- Landing page + estimator app (single task / workflow / code)
- 15+ models priced from verified July 2026 rates
- Risk tiers with honest variance bands per task type
- Demo video + GitHub launch kit
```

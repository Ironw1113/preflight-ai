# Preflight AI

**Know your AI bill before you run the task.**

Describe a task in plain language ("summarize 500 support tickets a day"), and Preflight estimates token usage, monthly cost, expected quality, and time-per-task across every major AI platform (Claude, GPT, Gemini, DeepSeek, Grok, Groq) — before you spend a dollar.

## Structure

```
preflight-app/
├── server/            Node/Express API
│   ├── index.js       API entry (serves client build in production)
│   ├── lib/estimator.js   Estimation engine (classification → token model → pricing → quality/time)
│   ├── data/models.json   Pricing + performance seed data (verified July 2026)
│   └── test/          Unit tests (node --test)
└── client/            React + Vite frontend
```

## Run it

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
- `POST /api/estimate` — body: `{ description, tasksPerMonth, avgInputWords, cacheHitRate (0–1), batch (bool) }`

## How estimation works

1. **Classify** the description into a task profile (coding, summarization, extraction, chat, writing, translation, RAG, agentic).
2. **Token model** — each profile has empirical input/output token seeds; doc-based tasks scale with input size; agentic tasks apply a round-trip multiplier.
3. **Price** monthly tokens against each model's verified rates (incl. cached-input and batch discounts).
4. **Score** quality per task category and estimate time from latency + tokens/sec.

Estimates carry a ±35% uncertainty band. Roadmap: calibrate token models against real usage (see business plan).

### Classification

`server/lib/estimator.js` classifies each description with the Claude API (`claude-haiku-4-5`, forced tool-call for structured output) when `ANTHROPIC_API_KEY` is set. Without a key, or if the API call fails, it falls back to the original keyword-scoring heuristic (`classifyTaskHeuristic`) — so the app degrades gracefully rather than failing. Override the model with `PREFLIGHT_CLASSIFIER_MODEL`.

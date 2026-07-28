# Roadmap — agreed priorities

Derived from market research (July 2026): agents burn 5–30× tokens with ~30× per-task variance; 80% of enterprises miss AI forecasts by >25%; emerging best practice is cost projection + approval gates before production; nobody trusts public benchmarks. Full reasoning in `../Preflight-AI-Business-Plan-v2.docx`.

## Done
- [x] Three estimators: single task, multi-step workflow (context accumulation + mixed-model per-step plan), code (agent loops, language/codebase multipliers)
- [x] Coding-agent subscription comparison (seat quotas, utilization, API-equivalent cost)
- [x] Claude-powered task classification with heuristic fallback
- [x] Variance bands: P50/P90/blowout scenarios, RISK_TIERS per task type, risk banners in UI
- [x] Approval workflow: save a scenario + budget request (owner, P90 budget, blowout cap, justification) via `server/lib/approvals.js` (SQLite through `node:sqlite`, no accounts yet); approve/reject with timestamped audit trail in the "Approvals" tab; one-page print/PDF sign-off doc at `GET /api/approvals/:id/print` (browser print-to-PDF, no PDF library dependency)
- [x] Professional site: landing page (`client/src/Landing.jsx` — hero with pre-approval positioning, market-stat cards, P50/P90/blowout explainer, Predict→Approve→Enforce→Learn, feature grid, pricing tiers, footer), sticky `SiteNav` shared with the app, hash routing (`#/app`), Inter typography, SEO meta description
- [x] Guardrail config export: `server/lib/guardrailConfig.js` generates a LiteLLM `config.yaml` block (hard `max_budget` at the blowout cap, alert thresholds at 80%/100% of the approved P90 budget), a Portkey budget JSON, and a generic webhook JSON — all gated to `status === "approved"` requests via `GET /api/approvals/:id/guardrails/:format` (`?download=1` for a file download, otherwise raw text for copy-to-clipboard). Field names are only used where confident of the current schema; everything else ships as comments, with a "verify before applying" disclaimer. Inline "Guardrails" panel (3 cards, copy + download each) on approved rows in the Approvals tab.
- [x] File-upload task estimator, Single task **and** Code estimator tabs: upload the file the task runs on and the fixed size guess (`avgInputWords`, or the per-task-kind `inputTokens` seed in the code estimator) is replaced by the file's real word count. Server extracts text (`server/lib/fileExtract.js`, files processed in memory only, never persisted) from plain text/code, PDF, DOCX, and XLSX/XLS. In Single task, a bounded snippet also feeds `classifyTask()` for better task-type detection (both the Claude and heuristic paths). In the code estimator, "codebase size" still applies on top of the real file size (it models surrounding files the task touches, which a single uploaded file can't capture).

## 3. Bring-your-own-eval (the "Learn" stage — next up)
- User pastes 3–10 real sample tasks + their API keys (keys held in memory only, never stored)
- Run samples across selected models, capture actual token counts + outputs side by side
- Show measured tokens vs our predicted range; let the user grade outputs A/B/C
- Feed measured tokens back as a per-user calibration multiplier on future estimates

## 4. Unit economics view
- Per-task cost shown next to a user-supplied business unit ("per support ticket", "per invoice") with optional human-cost comparison for ROI framing

## 5. Price-churn re-forecasting
- Store snapshot of models.json with each saved scenario; on price change, show "your approved budget changed by X%" — later, email alerts

## Guardrails for implementation
- Keep every existing test green; add tests per feature
- No breaking changes to existing API response shapes
- Variance honesty in every new surface (never a single number)

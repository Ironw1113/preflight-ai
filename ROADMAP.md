# Roadmap — agreed priorities

Derived from market research (July 2026): agents burn 5–30× tokens with ~30× per-task variance; 80% of enterprises miss AI forecasts by >25%; emerging best practice is cost projection + approval gates before production; nobody trusts public benchmarks. Full reasoning in `../Preflight-AI-Business-Plan-v2.docx`.

## Done
- [x] Three estimators: single task, multi-step workflow (context accumulation + mixed-model per-step plan), code (agent loops, language/codebase multipliers)
- [x] Coding-agent subscription comparison (seat quotas, utilization, API-equivalent cost)
- [x] Claude-powered task classification with heuristic fallback
- [x] Variance bands: P50/P90/blowout scenarios, RISK_TIERS per task type, risk banners in UI
- [x] Professional site: landing page (`client/src/Landing.jsx` — hero with pre-approval positioning, market-stat cards, P50/P90/blowout explainer, Predict→Approve→Enforce→Learn, feature grid, footer), sticky `SiteNav` shared with the app, hash routing (`#/app`), Inter typography, SEO meta description. Pricing tiers section removed as of 2026-08-19 — not ready to commit to pricing yet; `TIERS`/`.tier-*` CSS pulled along with it (recoverable from git history whenever pricing is decided).
- [x] File-upload task estimator, Single task **and** Code estimator tabs: upload the file the task runs on and the fixed size guess (`avgInputWords`, or the per-task-kind `inputTokens` seed in the code estimator) is replaced by the file's real word count. Server extracts text (`server/lib/fileExtract.js`, files processed in memory only, never persisted) from plain text/code, PDF, DOCX, and XLSX/XLS. In Single task, a bounded snippet also feeds `classifyTask()` for better task-type detection (both the Claude and heuristic paths). In the code estimator, "codebase size" still applies on top of the real file size (it models surrounding files the task touches, which a single uploaded file can't capture).
- [x] Code estimator: replaced the task-kind dropdown with a free-text description ("describe the code change"), classified server-side into bugfix/feature/refactor/tests/review/greenfield (`classifyCodeTaskKind()` — Claude + heuristic fallback, same pattern as the Single Task classifier). Upload expanded from one file to a whole project: `ProjectUpload` offers both a multi-file picker and a folder picker (`webkitdirectory`), posting to `POST /api/extract-project`. `extractProjectText()` aggregates word counts across every readable file, silently skipping junk paths (node_modules, .git, dist, build, ...) and unsupported extensions rather than failing the whole batch.

## Built but paused (not mounted in the live app)
- **Approval workflow** (`server/lib/approvals.js`, `server/lib/signoffDoc.js`) and **guardrail config export** (`server/lib/guardrailConfig.js`) are fully implemented and tested (see their `test/*.test.js` files — still run and pass) but pulled from `server/index.js` and the client UI as of 2026-07-28: not ready to scale the SQLite-backed persistence yet. Re-enabling is cheap — the routes and UI just need re-adding, no logic to rebuild. See `server/index.js`'s comment at the top for the exact re-enable pointer. Revisit item 1 (Approve) and item 2 (Enforce) below once persistence is ready to scale.

## 1. Approval workflow (the "Approve" stage — paused, see above)
## 2. Guardrail config export (the "Enforce" stage — paused, see above)

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

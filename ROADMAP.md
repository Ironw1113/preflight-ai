# Roadmap — agreed priorities

Derived from market research (July 2026): agents burn 5–30× tokens with ~30× per-task variance; 80% of enterprises miss AI forecasts by >25%; emerging best practice is cost projection + approval gates before production; nobody trusts public benchmarks. Full reasoning in `../Preflight-AI-Business-Plan-v2.docx`.

## Done
- [x] Three estimators: single task, multi-step workflow (context accumulation + mixed-model per-step plan), code (agent loops, language/codebase multipliers)
- [x] Coding-agent subscription comparison (seat quotas, utilization, API-equivalent cost)
- [x] Claude-powered task classification with heuristic fallback
- [x] Variance bands: P50/P90/blowout scenarios, RISK_TIERS per task type, risk banners in UI
- [x] Approval workflow: save a scenario + budget request (owner, P90 budget, blowout cap, justification) via `server/lib/approvals.js` (SQLite through `node:sqlite`, no accounts yet); approve/reject with timestamped audit trail in the "Approvals" tab; one-page print/PDF sign-off doc at `GET /api/approvals/:id/print` (browser print-to-PDF, no PDF library dependency)

## 2. Guardrail config export (the "Enforce" stage — next up)
From an approved budget, generate config the user's gateway can enforce:
- LiteLLM `config.yaml` budget block (per-team budget, alert thresholds at 80%/100%)
- Portkey budget JSON
- Generic webhook/JSON format
- Copy-to-clipboard + download from the approval detail view

## 3. Bring-your-own-eval (the "Learn" stage)
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

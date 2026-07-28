/**
 * Guardrail config export — the "Enforce" stage. Turns an approved budget
 * request into starting-point config for the user's own AI gateway.
 *
 * LiteLLM and Portkey are real tools whose config schemas evolve; we only
 * use field names we're confident are current (LiteLLM's max_budget /
 * budget_duration / alerting; Portkey's general budget-limit shape) and
 * surface the derived numbers (80%/100% alert thresholds off the approved
 * P90 budget, hard cap at the blowout figure) as comments/fields rather
 * than inventing keys we can't verify. Every export says so explicitly.
 */

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "scenario";
}

function yamlString(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function liteLLMConfig(approval) {
  const { name, id, ownerName, p90Budget, blowoutCap } = approval;
  const p90Pct80 = +(p90Budget * 0.8).toFixed(2);
  return `# Preflight AI — guardrail config for "${name}"
# Generated ${new Date().toISOString()} · approval ${id} · owner ${ownerName}
# Budget to the P90 ($${p90Budget}/mo): alert your team at 80% ($${p90Pct80}/mo) and 100% ($${p90Budget}/mo).
# Hard-cap enforcement at the blowout figure ($${blowoutCap}/mo) — the runaway-scenario ceiling.
# Starting-point template — verify these keys against your LiteLLM version's docs before applying:
# https://docs.litellm.ai/docs/proxy/cost_tracking

litellm_settings:
  max_budget: ${blowoutCap}          # hard stop: LiteLLM blocks further calls once spend reaches this
  budget_duration: "30d"

general_settings:
  alerting: ["slack"]                # point this at your team's alert channel/webhook receiver

# Per-team budgets are typically set via the Admin UI or the CLI, e.g.:
#   litellm --add_team --team_alias ${yamlString(name)} --max_budget ${blowoutCap} --budget_duration 30d
`;
}

function portkeyConfig(approval) {
  const { name, id, ownerName, p90Budget, blowoutCap, kind, modelId, modelName, modelSource } = approval;
  return JSON.stringify(
    {
      _comment: "Preflight AI guardrail template — starting point only. Verify field names against current Portkey docs before applying: https://portkey.ai/docs",
      name: `${name} budget`,
      generatedAt: new Date().toISOString(),
      approvalId: id,
      owner: ownerName,
      scenario: { kind, modelId, modelName, modelSource },
      budgetLimit: {
        value: blowoutCap,
        currency: "USD",
        periodicResetType: "monthly"
      },
      alerts: [
        { thresholdPercent: 80, ofBudget: p90Budget, note: "80% of the approved P90 budget" },
        { thresholdPercent: 100, ofBudget: p90Budget, note: "100% of the approved P90 budget" }
      ]
    },
    null,
    2
  );
}

function genericWebhookConfig(approval) {
  const { id, name, ownerName, kind, modelId, modelName, modelSource, p90Budget, blowoutCap, decidedAt } = approval;
  return JSON.stringify(
    {
      source: "preflight-ai",
      approvalId: id,
      scenario: name,
      owner: ownerName,
      kind,
      model: { id: modelId, name: modelName, source: modelSource },
      budget: {
        currency: "USD",
        period: "monthly",
        p90Budget,
        blowoutCap,
        alertThresholdsPercentOfP90: [80, 100]
      },
      approvedAt: decidedAt,
      generatedAt: new Date().toISOString()
    },
    null,
    2
  );
}

module.exports = { liteLLMConfig, portkeyConfig, genericWebhookConfig, slug };

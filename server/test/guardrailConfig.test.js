const assert = require("node:assert");
const { test } = require("node:test");
const { liteLLMConfig, portkeyConfig, genericWebhookConfig, slug } = require("../lib/guardrailConfig");

function sampleApproval(overrides = {}) {
  return {
    id: "approval-123",
    name: "Support ticket summarization",
    ownerName: "Jordan Lee",
    kind: "single",
    modelId: "claude-sonnet-5",
    modelName: "Claude Sonnet 5",
    modelSource: "model",
    p90Budget: 500,
    blowoutCap: 1000,
    decidedAt: "2026-07-27T20:00:00.000Z",
    ...overrides
  };
}

test("liteLLMConfig hard-caps at the blowout figure and notes P90 alert thresholds", () => {
  const yaml = liteLLMConfig(sampleApproval());
  assert.match(yaml, /max_budget: 1000/);
  assert.match(yaml, /\$500\/mo/);
  assert.match(yaml, /\$400\/mo/); // 80% of 500
  assert.match(yaml, /budget_duration/);
  assert.match(yaml, /Starting-point template/);
});

test("portkeyConfig is valid JSON with the hard cap as budgetLimit and P90 alert thresholds", () => {
  const json = portkeyConfig(sampleApproval());
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.budgetLimit.value, 1000);
  assert.strictEqual(parsed.budgetLimit.currency, "USD");
  assert.strictEqual(parsed.alerts.length, 2);
  assert.deepStrictEqual(parsed.alerts.map((a) => a.thresholdPercent), [80, 100]);
  assert.ok(parsed.alerts.every((a) => a.ofBudget === 500));
  assert.strictEqual(parsed.approvalId, "approval-123");
});

test("genericWebhookConfig is valid JSON carrying budget, model, and approval metadata", () => {
  const json = genericWebhookConfig(sampleApproval());
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.source, "preflight-ai");
  assert.strictEqual(parsed.budget.p90Budget, 500);
  assert.strictEqual(parsed.budget.blowoutCap, 1000);
  assert.deepStrictEqual(parsed.budget.alertThresholdsPercentOfP90, [80, 100]);
  assert.strictEqual(parsed.model.id, "claude-sonnet-5");
  assert.strictEqual(parsed.approvedAt, "2026-07-27T20:00:00.000Z");
});

test("slug turns a scenario name into a filename-safe string", () => {
  assert.strictEqual(slug("Support ticket summarization"), "support-ticket-summarization");
  assert.strictEqual(slug('Weird "quotes" & slashes/here'), "weird-quotes-slashes-here");
  assert.strictEqual(slug(""), "scenario");
});

test("configs escape special characters in the scenario name safely", () => {
  const approval = sampleApproval({ name: 'Say "hi" \\ test' });
  assert.doesNotThrow(() => liteLLMConfig(approval));
  assert.doesNotThrow(() => JSON.parse(portkeyConfig(approval)));
  assert.doesNotThrow(() => JSON.parse(genericWebhookConfig(approval)));
});

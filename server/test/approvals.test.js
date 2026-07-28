const assert = require("node:assert");
const { test, beforeEach } = require("node:test");
const { createApproval, listApprovals, getApproval, decideApproval, resetDbForTests } = require("../lib/approvals");
const data = require("../data/models.json");

delete process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  resetDbForTests(":memory:");
});

function baseParams(overrides = {}) {
  return {
    name: "Support ticket summarization",
    kind: "single",
    estimateParams: { description: "Summarize 500 customer support tickets into a daily digest", tasksPerMonth: 1000 },
    modelId: "claude-sonnet-5",
    ownerName: "Jordan Lee",
    p90Budget: 500,
    blowoutCap: 1000,
    justification: "Reduce support team triage time.",
    ...overrides
  };
}

test("creates a pending approval with a fresh server-side estimate snapshot", async () => {
  const approval = await createApproval(baseParams(), data.models, data.codingTools);
  assert.strictEqual(approval.status, "pending");
  assert.strictEqual(approval.decidedAt, null);
  assert.strictEqual(approval.modelName, "Claude Sonnet 5");
  assert.ok(approval.result.results.length === data.models.length, "stores a full estimate snapshot");
  assert.strictEqual(approval.result.task.type, "summarization");
});

test("rejects missing required fields", async () => {
  await assert.rejects(() => createApproval(baseParams({ name: "" }), data.models, data.codingTools));
  await assert.rejects(() => createApproval(baseParams({ ownerName: "" }), data.models, data.codingTools));
  await assert.rejects(() => createApproval(baseParams({ justification: "" }), data.models, data.codingTools));
  await assert.rejects(() => createApproval(baseParams({ p90Budget: 0 }), data.models, data.codingTools));
  await assert.rejects(() => createApproval(baseParams({ blowoutCap: 10, p90Budget: 500 }), data.models, data.codingTools), /blowoutCap/);
});

test("rejects an unknown modelId", async () => {
  await assert.rejects(() => createApproval(baseParams({ modelId: "not-a-real-model" }), data.models, data.codingTools));
});

test("supports coding-tool approvals via modelSource", async () => {
  const approval = await createApproval(
    baseParams({
      kind: "code",
      estimateParams: { taskKind: "feature", tasksPerMonth: 200 },
      modelId: "claude-code-pro",
      modelSource: "codingTool"
    }),
    data.models,
    data.codingTools
  );
  assert.strictEqual(approval.modelName, "Claude Code (Pro)");
  assert.strictEqual(approval.result.task.type, "coding");
});

test("lists approvals newest first and gets full detail by id", async () => {
  const a = await createApproval(baseParams({ name: "First" }), data.models, data.codingTools);
  const b = await createApproval(baseParams({ name: "Second" }), data.models, data.codingTools);
  const list = listApprovals();
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].name, "Second", "newest first");
  const detail = getApproval(a.id);
  assert.strictEqual(detail.name, "First");
  assert.deepStrictEqual(detail.params, a.params);
});

test("getApproval throws for unknown id", () => {
  assert.throws(() => getApproval("nope"));
});

test("decide approves or rejects with a timestamp, and locks further decisions", async () => {
  const approval = await createApproval(baseParams(), data.models, data.codingTools);
  const decided = decideApproval(approval.id, { status: "approved", decisionNote: "Looks reasonable." });
  assert.strictEqual(decided.status, "approved");
  assert.ok(decided.decidedAt);
  assert.strictEqual(decided.decisionNote, "Looks reasonable.");
  assert.throws(() => decideApproval(approval.id, { status: "rejected" }), /already decided/);
});

test("decide rejects an invalid status value", async () => {
  const approval = await createApproval(baseParams(), data.models, data.codingTools);
  assert.throws(() => decideApproval(approval.id, { status: "maybe" }));
});

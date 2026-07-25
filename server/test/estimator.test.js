const assert = require("node:assert");
const { test } = require("node:test");
const { estimate, estimateWorkflow, estimateCode, classifyTask, classifyTaskHeuristic } = require("../lib/estimator");
const data = require("../data/models.json");

// No ANTHROPIC_API_KEY in the test env, so classifyTask exercises the
// keyword-heuristic fallback path deterministically (no network calls).
delete process.env.ANTHROPIC_API_KEY;

test("classifies coding tasks", async () => {
  const { taskType } = await classifyTask("Generate a React component from a spec and write unit tests");
  assert.strictEqual(taskType, "coding");
});

test("classifies summarization tasks", async () => {
  const { taskType } = await classifyTask("Summarize 500 customer support tickets into a daily digest");
  assert.strictEqual(taskType, "summarization");
});

test("heuristic classifier matches direct call", () => {
  const { taskType } = classifyTaskHeuristic("Extract line items from vendor invoices into JSON");
  assert.strictEqual(taskType, "extraction");
});

test("estimate returns results for all models with sane values", async () => {
  const r = await estimate({ description: "summarize legal documents", tasksPerMonth: 1000, avgInputWords: 2000 }, data.models);
  assert.strictEqual(r.results.length, data.models.length);
  for (const m of r.results) {
    assert.ok(m.monthlyCost.mid > 0, `${m.name} cost > 0`);
    assert.ok(m.monthlyCost.low < m.monthlyCost.mid && m.monthlyCost.mid < m.monthlyCost.high);
    assert.ok(m.quality >= 50 && m.quality <= 100);
    assert.ok(m.secondsPerTask > 0);
  }
});

test("cache hit rate lowers cost for models with cached pricing", async () => {
  const base = await estimate({ description: "chatbot for customer support", tasksPerMonth: 10000 }, data.models);
  const cached = await estimate({ description: "chatbot for customer support", tasksPerMonth: 10000, cacheHitRate: 0.8 }, data.models);
  const b = base.results.find((m) => m.id === "claude-sonnet-5");
  const c = cached.results.find((m) => m.id === "claude-sonnet-5");
  assert.ok(c.monthlyCost.mid < b.monthlyCost.mid);
});

test("batch halves cost", async () => {
  const base = await estimate({ description: "translate product descriptions to French", tasksPerMonth: 5000, avgInputWords: 100 }, data.models);
  const batch = await estimate({ description: "translate product descriptions to French", tasksPerMonth: 5000, avgInputWords: 100, batch: true }, data.models);
  const b = base.results.find((m) => m.id === "gemini-2-5-flash");
  const c = batch.results.find((m) => m.id === "gemini-2-5-flash");
  assert.ok(Math.abs(c.monthlyCost.mid - b.monthlyCost.mid / 2) < 0.01);
});

test("rejects empty description", async () => {
  await assert.rejects(() => estimate({ description: "" }, data.models));
});

// --- multi-step workflow ---

test("workflow accumulates context across steps", async () => {
  const r = await estimateWorkflow({
    steps: [
      { description: "Extract data from the invoice", avgInputWords: 300 },
      { description: "Summarize the extracted data", avgInputWords: 300 },
      { description: "Write an email to the vendor", avgInputWords: 100 }
    ],
    tasksPerMonth: 500
  }, data.models);

  assert.strictEqual(r.workflow.steps.length, 3);
  assert.ok(r.tokensPerRun.input.mid > 0 && r.tokensPerRun.output.mid > 0);
  // context accumulation: two identical steps → step 2 input = step 1 input + step 1 output
  const twin = await estimateWorkflow({
    steps: [
      { description: "Summarize the quarterly report", avgInputWords: 400 },
      { description: "Summarize the quarterly report", avgInputWords: 400 }
    ],
    tasksPerMonth: 100
  }, data.models);
  const [t1, t2] = twin.workflow.steps;
  assert.strictEqual(t2.tokens.input.mid, t1.tokens.input.mid + t1.tokens.output.mid, "step 2 carries step 1 output");
  assert.strictEqual(r.results.length, data.models.length);
  assert.ok(Array.isArray(r.mixedPlan) && r.mixedPlan.length === 3);
  for (const p of r.mixedPlan) assert.ok(p.model && p.monthlyCost >= 0);
});

test("workflow with more steps costs more than fewer steps", async () => {
  const oneStep = await estimateWorkflow({ steps: [{ description: "Summarize the report" }], tasksPerMonth: 100 }, data.models);
  const threeStep = await estimateWorkflow({
    steps: [
      { description: "Summarize the report" },
      { description: "Extract key figures into JSON" },
      { description: "Draft an email with the findings" }
    ],
    tasksPerMonth: 100
  }, data.models);
  const a = oneStep.results.find((m) => m.id === "claude-sonnet-5");
  const b = threeStep.results.find((m) => m.id === "claude-sonnet-5");
  assert.ok(b.monthlyCost.mid > a.monthlyCost.mid);
});

test("workflow rejects empty steps", async () => {
  await assert.rejects(() => estimateWorkflow({ steps: [] }, data.models));
  await assert.rejects(() => estimateWorkflow({ steps: [{ description: "" }] }, data.models));
});

// --- code estimator ---

test("code estimator returns results for all models", () => {
  const r = estimateCode({ taskKind: "feature", language: "typescript", codebaseSize: "medium", tasksPerMonth: 200 }, data.models);
  assert.strictEqual(r.results.length, data.models.length);
  assert.strictEqual(r.task.type, "coding");
  for (const m of r.results) {
    assert.ok(m.monthlyCost.mid > 0);
    assert.ok(m.quality >= 50 && m.quality <= 100);
  }
});

test("bug fix costs less than new feature at same volume", () => {
  const bug = estimateCode({ taskKind: "bugfix", tasksPerMonth: 100 }, data.models);
  const feat = estimateCode({ taskKind: "feature", tasksPerMonth: 100 }, data.models);
  const b = bug.results.find((m) => m.id === "claude-sonnet-5");
  const f = feat.results.find((m) => m.id === "claude-sonnet-5");
  assert.ok(b.monthlyCost.mid < f.monthlyCost.mid);
});

test("large codebase costs more than small", () => {
  const small = estimateCode({ taskKind: "feature", codebaseSize: "small", tasksPerMonth: 100 }, data.models);
  const large = estimateCode({ taskKind: "feature", codebaseSize: "large", tasksPerMonth: 100 }, data.models);
  const s = small.results.find((m) => m.id === "gpt-5-6-terra");
  const l = large.results.find((m) => m.id === "gpt-5-6-terra");
  assert.ok(l.monthlyCost.mid > s.monthlyCost.mid);
});

test("code estimator rejects unknown task kind", () => {
  assert.throws(() => estimateCode({ taskKind: "nonsense" }, data.models));
});

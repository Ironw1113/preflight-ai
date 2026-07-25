const assert = require("node:assert");
const { test } = require("node:test");
const { estimate, classifyTask, classifyTaskHeuristic } = require("../lib/estimator");
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

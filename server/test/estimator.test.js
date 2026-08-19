const assert = require("node:assert");
const { test } = require("node:test");
const { estimate, estimateWorkflow, estimateCode, classifyTask, classifyTaskHeuristic, classifyCodeTaskKindHeuristic } = require("../lib/estimator");
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

test("code estimator returns results for all models", async () => {
  const r = await estimateCode({ taskKind: "feature", language: "typescript", codebaseSize: "medium", tasksPerMonth: 200 }, data.models);
  assert.strictEqual(r.results.length, data.models.length);
  assert.strictEqual(r.task.type, "coding");
  for (const m of r.results) {
    assert.ok(m.monthlyCost.mid > 0);
    assert.ok(m.quality >= 50 && m.quality <= 100);
  }
});

test("bug fix costs less than new feature at same volume", async () => {
  const bug = await estimateCode({ taskKind: "bugfix", tasksPerMonth: 100 }, data.models);
  const feat = await estimateCode({ taskKind: "feature", tasksPerMonth: 100 }, data.models);
  const b = bug.results.find((m) => m.id === "claude-sonnet-5");
  const f = feat.results.find((m) => m.id === "claude-sonnet-5");
  assert.ok(b.monthlyCost.mid < f.monthlyCost.mid);
});

test("large codebase costs more than small", async () => {
  const small = await estimateCode({ taskKind: "feature", codebaseSize: "small", tasksPerMonth: 100 }, data.models);
  const large = await estimateCode({ taskKind: "feature", codebaseSize: "large", tasksPerMonth: 100 }, data.models);
  const s = small.results.find((m) => m.id === "gpt-5-6-terra");
  const l = large.results.find((m) => m.id === "gpt-5-6-terra");
  assert.ok(l.monthlyCost.mid > s.monthlyCost.mid);
});

test("code estimator rejects unknown task kind", async () => {
  await assert.rejects(() => estimateCode({ taskKind: "nonsense" }, data.models));
});

test("code estimator requires a description when taskKind is not given", async () => {
  await assert.rejects(() => estimateCode({ tasksPerMonth: 100 }, data.models));
});

test("uploaded file word count replaces the fixed input-token seed", async () => {
  const guessed = await estimateCode({ taskKind: "feature", tasksPerMonth: 100 }, data.models);
  const fromFile = await estimateCode({ taskKind: "feature", tasksPerMonth: 100, fileWordCount: 4000 }, data.models);
  assert.notStrictEqual(fromFile.tokensPerTask.input.mid, guessed.tokensPerTask.input.mid);
  assert.strictEqual(fromFile.assumptions.fileWordCount, 4000);
  assert.strictEqual(guessed.assumptions.fileWordCount, null);
});

test("a larger uploaded file produces a larger input estimate, all else equal", async () => {
  const smallFile = await estimateCode({ taskKind: "refactor", tasksPerMonth: 100, fileWordCount: 500 }, data.models);
  const bigFile = await estimateCode({ taskKind: "refactor", tasksPerMonth: 100, fileWordCount: 8000 }, data.models);
  assert.ok(bigFile.tokensPerTask.input.mid > smallFile.tokensPerTask.input.mid);
});

test("codebaseSize still scales on top of a real file's size", async () => {
  const small = await estimateCode({ taskKind: "feature", codebaseSize: "small", tasksPerMonth: 100, fileWordCount: 2000 }, data.models);
  const large = await estimateCode({ taskKind: "feature", codebaseSize: "large", tasksPerMonth: 100, fileWordCount: 2000 }, data.models);
  assert.ok(large.tokensPerTask.input.mid > small.tokensPerTask.input.mid);
});

// --- code task classification (replaces the taskKind dropdown) ---

test("classifies a described bug fix", async () => {
  const r = await estimateCode({ description: "Fix the crash when a user submits an empty form", tasksPerMonth: 100 }, data.models);
  assert.strictEqual(r.assumptions.taskKind, "bugfix");
  assert.strictEqual(r.assumptions.description, "Fix the crash when a user submits an empty form");
});

test("classifies a described new feature", async () => {
  const r = await estimateCode({ description: "Add support for exporting reports to CSV", tasksPerMonth: 100 }, data.models);
  assert.strictEqual(r.assumptions.taskKind, "feature");
});

test("classifies a described refactor", async () => {
  const r = await estimateCode({ description: "Refactor the payment module to reduce technical debt", tasksPerMonth: 100 }, data.models);
  assert.strictEqual(r.assumptions.taskKind, "refactor");
});

test("an explicit taskKind skips classification and reports high confidence", async () => {
  const r = await estimateCode({ taskKind: "bugfix", tasksPerMonth: 100 }, data.models);
  assert.strictEqual(r.task.confidence, "high");
});

test("classifyCodeTaskKindHeuristic considers the file snippet as well as the description", () => {
  const r = classifyCodeTaskKindHeuristic("Clean this up", "This function has a lot of technical debt and needs restructuring");
  assert.strictEqual(r.taskKind, "refactor");
});

// --- variance bands / risk scenarios ---

test("agentic tasks get very-high risk with 30x blowout", async () => {
  const r = await estimate({ description: "Automate a multi-step research agent workflow with browsing", tasksPerMonth: 100 }, data.models);
  assert.strictEqual(r.risk.level, "very-high");
  assert.strictEqual(r.risk.blowoutMult, 30);
  assert.ok(r.risk.warning);
});

test("extraction tasks get low risk, no warning", async () => {
  const r = await estimate({ description: "Extract line items from vendor invoices into JSON", tasksPerMonth: 100 }, data.models);
  assert.strictEqual(r.risk.level, "low");
  assert.strictEqual(r.risk.warning, null);
});

test("scenarios ordered p50 <= p90 <= blowout on every model", async () => {
  const r = await estimate({ description: "chatbot for customer support", tasksPerMonth: 1000 }, data.models);
  for (const m of r.results) {
    assert.ok(m.scenarios, `${m.name} has scenarios`);
    assert.ok(m.scenarios.p50 <= m.scenarios.p90 && m.scenarios.p90 <= m.scenarios.blowout);
    assert.strictEqual(m.scenarios.p50, m.monthlyCost.mid);
  }
});

test("workflow risk is bumped above the worst step tier", async () => {
  const r = await estimateWorkflow({
    steps: [
      { description: "Extract fields from the document" },
      { description: "Summarize the extracted fields" }
    ],
    tasksPerMonth: 100
  }, data.models);
  // both steps are low-risk, chaining bumps to medium
  assert.strictEqual(r.risk.level, "medium");
  assert.ok(r.risk.warning, "workflow always carries a warning");
});

test("code estimator carries high risk and scenarios", async () => {
  const r = await estimateCode({ taskKind: "feature", tasksPerMonth: 100 }, data.models);
  assert.strictEqual(r.risk.level, "high");
  const m = r.results[0];
  assert.ok(Math.abs(m.scenarios.blowout - m.scenarios.p50 * 8) < 0.1, "blowout ≈ 8× p50");
});

// --- coding agent tools (Claude Code, Codex CLI, Copilot, Cursor) ---

test("coding tools list is omitted-safe when not provided", async () => {
  const r = await estimateCode({ taskKind: "feature", tasksPerMonth: 100 }, data.models);
  assert.deepStrictEqual(r.codingTools, []);
});

test("coding tools report flat subscription price alongside API-equivalent cost", async () => {
  const r = await estimateCode({ taskKind: "feature", tasksPerMonth: 200 }, data.models, data.codingTools);
  assert.strictEqual(r.codingTools.length, data.codingTools.length);
  const claudeCodePro = r.codingTools.find((t) => t.id === "claude-code-pro");
  assert.strictEqual(claudeCodePro.monthlyCost.mid, 20);
  assert.strictEqual(claudeCodePro.monthlyCost.low, claudeCodePro.monthlyCost.high, "subscription price has no uncertainty band");
  assert.ok(claudeCodePro.apiEquivalentMonthlyCost > 0);
  assert.strictEqual(typeof claudeCodePro.cheaperThanApiEquivalent, "boolean");

  const copilot = r.codingTools.find((t) => t.id === "copilot-individual");
  assert.strictEqual(copilot.apiEquivalentMonthlyCost, null, "tools with no underlying model have no API-equivalent cost");
  assert.ok(copilot.quality >= 50 && copilot.quality <= 100);
});

test("high-volume usage makes flat subscriptions cheaper than the metered equivalent", async () => {
  const r = await estimateCode({ taskKind: "feature", codebaseSize: "large", tasksPerMonth: 5000 }, data.models, data.codingTools);
  const claudeCodePro = r.codingTools.find((t) => t.id === "claude-code-pro");
  assert.ok(claudeCodePro.apiEquivalentMonthlyCost > claudeCodePro.monthlyCost.mid);
  assert.strictEqual(claudeCodePro.cheaperThanApiEquivalent, true);
});

// --- quota / usage-window estimates ---

test("low volume fits comfortably within a single seat's quota", async () => {
  const r = await estimateCode({ taskKind: "feature", tasksPerMonth: 200 }, data.models, data.codingTools);
  const ccp = r.codingTools.find((t) => t.id === "claude-code-pro");
  assert.ok(ccp.quota.utilizationPct < 100, "should not exceed quota at default volume");
  assert.strictEqual(ccp.quota.seatsNeeded, 1);
  assert.strictEqual(ccp.quota.hoursUntilQuotaExhausted, ccp.quota.windowHours, "quota lasts the full window when under 100%");
  assert.strictEqual(ccp.monthlyCost.mid, 20, "single seat, no markup");
  assert.strictEqual(ccp.quota.windowLabel, "5-hour");
});

test("high volume exceeds a single seat's quota and scales seats + price", async () => {
  const r = await estimateCode({ taskKind: "feature", codebaseSize: "large", tasksPerMonth: 5000 }, data.models, data.codingTools);
  const ccp = r.codingTools.find((t) => t.id === "claude-code-pro");
  assert.ok(ccp.quota.utilizationPct > 100);
  assert.ok(ccp.quota.seatsNeeded > 1);
  assert.strictEqual(ccp.monthlyCost.mid, 20 * ccp.quota.seatsNeeded, "price scales with seats needed");
  assert.ok(ccp.quota.hoursUntilQuotaExhausted < ccp.quota.windowHours, "quota would run out before the window resets");
});

test("monthly-reset tools report a monthly window label", async () => {
  const r = await estimateCode({ taskKind: "feature", tasksPerMonth: 200 }, data.models, data.codingTools);
  const cursor = r.codingTools.find((t) => t.id === "cursor-pro");
  assert.strictEqual(cursor.quota.windowLabel, "monthly");
  assert.strictEqual(cursor.quota.windowHours, 730);
});

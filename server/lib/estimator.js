/**
 * Preflight AI — estimation engine.
 *
 * Turns a plain-language task description + volume inputs into per-model
 * estimates of token usage, monthly cost, quality, and time-per-task.
 *
 * Token profiles are heuristic seeds. In production these are calibrated
 * against real usage data (the calibration loop described in the business plan).
 */

const TASK_PROFILES = {
  coding: {
    label: "Code generation / engineering task",
    keywords: ["code", "coding", "function", "component", "react", "api", "script", "bug", "refactor", "test", "sql", "程序", "implement", "debug", "typescript", "python", "javascript"],
    // tokens per task unit
    inputTokens: 2500,   // spec + relevant context
    outputTokens: 1800,  // generated code + explanation
    agentMultiplier: 3.5, // agentic coding loops re-read context, run tools
    qualityKey: "coding"
  },
  summarization: {
    label: "Summarization / condensing documents",
    keywords: ["summarize", "summary", "summarization", "condense", "digest", "tl;dr", "brief", "abstract", "recap"],
    inputTokens: 0,       // computed from document size
    outputTokens: 0,      // ~1/6 of input
    inputFromWords: true,
    outputRatio: 0.17,
    agentMultiplier: 1.0,
    qualityKey: "summarization"
  },
  extraction: {
    label: "Data extraction / classification",
    keywords: ["extract", "extraction", "parse", "classify", "classification", "label", "tag", "structured", "json", "fields", "invoice", "receipt", "form"],
    inputFromWords: true,
    outputRatio: 0.10,
    minOutput: 150,
    agentMultiplier: 1.0,
    qualityKey: "extraction"
  },
  chat: {
    label: "Customer support / chat assistant",
    keywords: ["chat", "chatbot", "support", "customer", "assistant", "faq", "helpdesk", "conversation", "reply", "respond"],
    inputTokens: 1200,   // system prompt + history + KB snippets
    outputTokens: 300,
    agentMultiplier: 1.2,
    qualityKey: "chat"
  },
  writing: {
    label: "Content writing / drafting",
    keywords: ["write", "draft", "blog", "article", "email", "post", "copy", "content", "marketing", "newsletter", "description", "essay"],
    inputTokens: 600,
    outputTokens: 1400,
    agentMultiplier: 1.0,
    qualityKey: "writing"
  },
  translation: {
    label: "Translation / localization",
    keywords: ["translate", "translation", "localize", "localization", "language", "spanish", "french", "german", "japanese", "chinese"],
    inputFromWords: true,
    outputRatio: 1.1,
    agentMultiplier: 1.0,
    qualityKey: "translation"
  },
  rag: {
    label: "RAG / Q&A over documents",
    keywords: ["question", "answer", "q&a", "search", "knowledge base", "rag", "retrieval", "lookup", "documents", "docs"],
    inputTokens: 3000,   // retrieved chunks + question
    outputTokens: 350,
    agentMultiplier: 1.0,
    qualityKey: "reasoning"
  },
  agentic: {
    label: "Agentic / multi-step workflow",
    keywords: ["agent", "agentic", "workflow", "automate", "automation", "pipeline", "multi-step", "orchestrate", "browse", "research"],
    inputTokens: 4000,
    outputTokens: 1200,
    agentMultiplier: 5.0,
    qualityKey: "agentic"
  }
};

const WORDS_TO_TOKENS = 1.35; // ~1.35 tokens per English word
const RANGE = 0.35;           // ±35% uncertainty band on heuristic estimates

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLASSIFIER_MODEL = process.env.PREFLIGHT_CLASSIFIER_MODEL || "claude-haiku-4-5-20251001";

const CLASSIFY_TOOL = {
  name: "classify_task",
  description: "Record the single best-fitting task category for an AI task description.",
  input_schema: {
    type: "object",
    properties: {
      taskType: { type: "string", enum: Object.keys(TASK_PROFILES) },
      confidence: { type: "string", enum: ["low", "medium", "high"] }
    },
    required: ["taskType", "confidence"]
  }
};

function classifyTaskHeuristic(description) {
  const text = description.toLowerCase();
  let best = null;
  let bestScore = 0;
  const scores = {};
  for (const [key, profile] of Object.entries(TASK_PROFILES)) {
    let score = 0;
    for (const kw of profile.keywords) {
      if (text.includes(kw)) score += kw.length > 4 ? 2 : 1;
    }
    scores[key] = score;
    if (score > bestScore) { bestScore = score; best = key; }
  }
  // default: general writing if nothing matched
  const taskType = best || "writing";
  const confidence = bestScore === 0 ? "low" : bestScore >= 4 ? "high" : "medium";
  return { taskType, confidence, scores };
}

// Claude classifies the description directly; forcing the classify_task tool
// call guarantees a structured, in-enum response instead of free-form text.
async function classifyTaskWithClaude(description) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const categoryList = Object.entries(TASK_PROFILES)
    .map(([key, p]) => `- ${key}: ${p.label}`)
    .join("\n");

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: CLASSIFIER_MODEL,
      max_tokens: 100,
      system: `Classify the user's plain-language AI task description into exactly one of these categories:\n${categoryList}\n\nPick the single best match, then rate your confidence in that match.`,
      messages: [{ role: "user", content: description }],
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: "classify_task" }
    })
  });

  if (!res.ok) throw new Error(`Claude classify request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const toolUse = data.content?.find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("Claude classify response missing tool_use block");
  const { taskType, confidence } = toolUse.input;
  if (!TASK_PROFILES[taskType]) throw new Error(`Unknown taskType from Claude: ${taskType}`);
  return { taskType, confidence, scores: null };
}

// Uses Claude when ANTHROPIC_API_KEY is set; otherwise (and on any API error)
// falls back to the keyword heuristic so the app still works without a key.
async function classifyTask(description) {
  try {
    const result = await classifyTaskWithClaude(description);
    if (result) return result;
  } catch (err) {
    console.warn(`Claude classifier unavailable, falling back to heuristic: ${err.message}`);
  }
  return classifyTaskHeuristic(description);
}

function tokensForTask(profile, { avgInputWords = 500 } = {}) {
  let input, output;
  if (profile.inputFromWords) {
    input = Math.round(avgInputWords * WORDS_TO_TOKENS) + 400; // + instructions overhead
    output = Math.max(profile.minOutput || 0, Math.round(avgInputWords * WORDS_TO_TOKENS * profile.outputRatio));
  } else {
    input = profile.inputTokens;
    output = profile.outputTokens;
  }
  input = Math.round(input * profile.agentMultiplier);
  output = Math.round(output * Math.max(1, profile.agentMultiplier * 0.6));
  return { input, output };
}

function range(v) {
  return { low: Math.round(v * (1 - RANGE)), mid: Math.round(v), high: Math.round(v * (1 + RANGE)) };
}

/**
 * Shared pricing core: given per-run token totals, price every model.
 * qualityFor(m) lets callers score quality per task, per workflow mix, etc.
 * latencyCount = number of sequential API calls per run (workflow steps, agent loops).
 */
function modelResults({ perTaskInput, perTaskOutput, tasksPerMonth, cacheHitRate = 0, batch = false, qualityFor, latencyCount = 1 }, models) {
  const monthlyInput = perTaskInput * tasksPerMonth;
  const monthlyOutput = perTaskOutput * tasksPerMonth;

  return models.map((m) => {
    const cachedShare = m.cachedInPrice != null ? cacheHitRate : 0;
    const inCost =
      (monthlyInput * (1 - cachedShare) * m.inPrice +
        monthlyInput * cachedShare * (m.cachedInPrice || 0)) / 1e6;
    const outCost = (monthlyOutput * m.outPrice) / 1e6;
    let monthlyCost = inCost + outCost;
    if (batch) monthlyCost *= 0.5;

    const quality = Math.round(qualityFor(m));
    const secondsPerTask = (m.latencyMs / 1000) * latencyCount + perTaskOutput / m.tokensPerSec;
    const fitsContext = perTaskInput <= m.context;

    return {
      id: m.id,
      name: m.name,
      provider: m.provider,
      quality,
      fitsContext,
      secondsPerTask: +secondsPerTask.toFixed(1),
      monthlyCost: {
        low: +(monthlyCost * (1 - RANGE)).toFixed(2),
        mid: +monthlyCost.toFixed(2),
        high: +(monthlyCost * (1 + RANGE)).toFixed(2)
      },
      costPerTask: +(monthlyCost / tasksPerMonth).toFixed(4),
      // value = quality points per dollar (log-damped so free-tier junk doesn't win)
      valueScore: +(quality / Math.log10(monthlyCost + 10)).toFixed(1)
    };
  });
}

function picksAndRec(results) {
  const usable = results.filter((r) => r.fitsContext);
  const byQuality = [...usable].sort((a, b) => b.quality - a.quality);
  const byCost = [...usable].sort((a, b) => a.monthlyCost.mid - b.monthlyCost.mid);
  const acceptable = byCost.filter((r) => r.quality >= 80);
  const bestQuality = byQuality[0] || null;
  const bestBudget = (acceptable[0] || byCost[0]) || null;

  let recommendation = null;
  if (bestQuality && bestBudget && bestQuality.id !== bestBudget.id && bestBudget.monthlyCost.mid > 0) {
    const pctQuality = Math.round((bestBudget.quality / bestQuality.quality) * 100);
    const pctCost = Math.round((bestBudget.monthlyCost.mid / bestQuality.monthlyCost.mid) * 100);
    recommendation = `${bestBudget.name} delivers ~${pctQuality}% of ${bestQuality.name}'s quality on this task type for ~${pctCost}% of the cost.`;
  } else if (bestQuality) {
    recommendation = `${bestQuality.name} is both the highest-quality and most economical fit for this task.`;
  }

  return { picks: { bestQuality: bestQuality?.id || null, bestBudget: bestBudget?.id || null }, recommendation };
}

/**
 * @param {object} params
 * @param {string} params.description  plain-language task description
 * @param {number} params.tasksPerMonth  how many times the task runs per month
 * @param {number} [params.avgInputWords]  avg source document length (for doc-based tasks)
 * @param {number} [params.cacheHitRate]  0–1, share of input tokens served from cache
 * @param {boolean} [params.batch]  use batch pricing (assume 50% discount where offered)
 * @param {Array} models  model records from models.json
 */
async function estimate(params, models) {
  const { description, tasksPerMonth = 1000, avgInputWords = 500, cacheHitRate = 0, batch = false } = params;
  if (!description || !description.trim()) throw new Error("description is required");
  if (tasksPerMonth <= 0) throw new Error("tasksPerMonth must be positive");

  const { taskType, confidence } = await classifyTask(description);
  const profile = TASK_PROFILES[taskType];
  const perTask = tokensForTask(profile, { avgInputWords });

  const results = modelResults({
    perTaskInput: perTask.input,
    perTaskOutput: perTask.output,
    tasksPerMonth, cacheHitRate, batch,
    qualityFor: (m) => m.quality[profile.qualityKey]
  }, models);

  const { picks, recommendation } = picksAndRec(results);

  return {
    task: { type: taskType, label: profile.label, confidence },
    tokensPerTask: { input: range(perTask.input), output: range(perTask.output) },
    monthlyTokens: { input: range(perTask.input * tasksPerMonth), output: range(perTask.output * tasksPerMonth) },
    assumptions: { tasksPerMonth, avgInputWords, cacheHitRate, batch, wordsToTokens: WORDS_TO_TOKENS, uncertainty: `±${RANGE * 100}%` },
    results: results.sort((a, b) => b.valueScore - a.valueScore),
    picks,
    recommendation,
    disclaimer: "Heuristic pre-launch estimates. Ranges reflect ±35% uncertainty; calibrate against real usage before committing budgets."
  };
}

/**
 * Multi-step workflow estimator with context accumulation:
 * each step's input carries the outputs of all previous steps, which is
 * why agentic pipelines cost far more than the sum of isolated calls.
 *
 * @param {object} params
 * @param {Array<{description: string, avgInputWords?: number}>} params.steps
 * @param {number} params.tasksPerMonth  workflow runs per month
 */
async function estimateWorkflow(params, models) {
  const { steps, tasksPerMonth = 1000, cacheHitRate = 0, batch = false } = params;
  if (!Array.isArray(steps) || steps.length === 0) throw new Error("steps must be a non-empty array");
  if (steps.length > 12) throw new Error("maximum 12 steps");
  if (tasksPerMonth <= 0) throw new Error("tasksPerMonth must be positive");

  const classified = await Promise.all(steps.map(async (s, i) => {
    if (!s.description || !s.description.trim()) throw new Error(`step ${i + 1} needs a description`);
    const { taskType, confidence } = await classifyTask(s.description);
    const profile = TASK_PROFILES[taskType];
    const base = tokensForTask(profile, { avgInputWords: s.avgInputWords || 500 });
    return { index: i + 1, description: s.description, taskType, label: profile.label, confidence, qualityKey: profile.qualityKey, base };
  }));

  // context accumulation: step i re-reads all previous outputs
  let carry = 0;
  const stepDetails = classified.map((s) => {
    const input = s.base.input + carry;
    const output = s.base.output;
    carry += output;
    return { ...s, tokens: { input, output } };
  });

  const totalInput = stepDetails.reduce((a, s) => a + s.tokens.input, 0);
  const totalOutput = stepDetails.reduce((a, s) => a + s.tokens.output, 0);
  const totalWeight = stepDetails.reduce((a, s) => a + s.tokens.input + s.tokens.output, 0);

  const results = modelResults({
    perTaskInput: totalInput,
    perTaskOutput: totalOutput,
    tasksPerMonth, cacheHitRate, batch,
    latencyCount: stepDetails.length,
    // token-weighted average quality across the step categories
    qualityFor: (m) => stepDetails.reduce((a, s) => a + m.quality[s.qualityKey] * (s.tokens.input + s.tokens.output), 0) / totalWeight
  }, models);

  const { picks, recommendation } = picksAndRec(results);

  // mixed-model plan: per step, cheapest model with quality >= 85 for that step's category
  const discount = batch ? 0.5 : 1;
  const stepCost = (m, s) => {
    const cachedShare = m.cachedInPrice != null ? cacheHitRate : 0;
    return ((s.tokens.input * ((1 - cachedShare) * m.inPrice + cachedShare * (m.cachedInPrice || 0)) +
      s.tokens.output * m.outPrice) / 1e6) * discount;
  };
  const mixedPlan = stepDetails.map((s) => {
    const eligible = models.filter((m) => m.quality[s.qualityKey] >= 85 && s.tokens.input <= m.context);
    const pool = eligible.length ? eligible : models.filter((m) => s.tokens.input <= m.context);
    const pick = [...pool].sort((a, b) => stepCost(a, s) - stepCost(b, s))[0];
    return { step: s.index, label: s.label, model: pick.name, modelId: pick.id, quality: pick.quality[s.qualityKey], monthlyCost: +(stepCost(pick, s) * tasksPerMonth).toFixed(2) };
  });
  const mixedMonthly = +mixedPlan.reduce((a, p) => a + p.monthlyCost, 0).toFixed(2);

  let mixedRecommendation = null;
  const top = results.find((r) => r.id === picks.bestQuality);
  if (top && mixedMonthly < top.monthlyCost.mid * 0.85) {
    const savings = Math.round((1 - mixedMonthly / top.monthlyCost.mid) * 100);
    mixedRecommendation = `Mixing models per step (${mixedPlan.map((p) => `step ${p.step}: ${p.model}`).join(", ")}) costs ~$${mixedMonthly}/mo — ${savings}% less than running the whole workflow on ${top.name}.`;
  }

  return {
    workflow: {
      steps: stepDetails.map((s) => ({ step: s.index, description: s.description, type: s.taskType, label: s.label, confidence: s.confidence, tokens: { input: range(s.tokens.input), output: range(s.tokens.output) } })),
      contextAccumulation: true
    },
    tokensPerRun: { input: range(totalInput), output: range(totalOutput) },
    monthlyTokens: { input: range(totalInput * tasksPerMonth), output: range(totalOutput * tasksPerMonth) },
    assumptions: { tasksPerMonth, cacheHitRate, batch, uncertainty: `±${RANGE * 100}%` },
    results: results.sort((a, b) => b.valueScore - a.valueScore),
    picks,
    recommendation,
    mixedPlan,
    mixedMonthly,
    mixedRecommendation,
    disclaimer: "Heuristic pre-launch estimates. Ranges reflect ±35% uncertainty; calibrate against real usage before committing budgets."
  };
}

/**
 * Dedicated coding-task estimator: models the agentic loop behavior of
 * AI coding (re-reading context, running tests, retrying) per task kind.
 */
const CODE_TASKS = {
  bugfix:     { label: "Bug fix",                  inputTokens: 3000, outputTokens: 800,  loops: 3.0 },
  feature:    { label: "New feature",              inputTokens: 5000, outputTokens: 2500, loops: 4.0 },
  refactor:   { label: "Refactor",                 inputTokens: 6000, outputTokens: 3000, loops: 3.5 },
  tests:      { label: "Write tests",              inputTokens: 4000, outputTokens: 2000, loops: 2.5 },
  review:     { label: "Code review",              inputTokens: 6000, outputTokens: 1200, loops: 1.5 },
  greenfield: { label: "New project from scratch", inputTokens: 1500, outputTokens: 4000, loops: 3.0 }
};

const CODEBASE_SIZE = { small: 0.6, medium: 1.0, large: 1.8 };
const VERBOSE_LANGS = ["java", "c#", "csharp", "c++", "cpp", "objective-c"];
const TERSE_LANGS = ["python", "ruby", "go"];

const HOURS_PER_MONTH = 730; // average month

function quotaWindowLabel(hours) {
  if (hours <= 24) return `${hours}-hour`;
  if (hours <= 24 * 8) return "weekly";
  return "monthly";
}

/**
 * Coding-agent products (Claude Code, Codex CLI, GitHub Copilot, Cursor, ...)
 * bill as a flat monthly seat with a usage quota that resets on a rolling
 * window (5 hours, weekly, monthly) — not $/token like the raw API rows
 * above. For each we estimate what share of that quota the requested volume
 * would consume, how many seats you'd actually need to sustain it without
 * getting capped, and what the same tokens would cost metered through the
 * tool's underlying model, so seat-license vs. pay-per-token is comparable.
 * Quota sizes are heuristic assumptions (providers rarely publish exact
 * token-equivalent limits) — treat utilization as directional, not exact.
 */
function estimateCodingTools({ input, output, tasksPerMonth, cacheHitRate, batch, latencyCount }, models, codingTools) {
  const results = codingTools.map((tool) => {
    const underlying = tool.underlyingModel ? models.find((m) => m.id === tool.underlyingModel) : null;
    const quality = tool.qualityOverride ?? underlying?.quality.coding ?? 80;
    const fitsContext = underlying ? input <= underlying.context : true;
    const secondsPerTask = underlying
      ? (underlying.latencyMs / 1000) * latencyCount + output / underlying.tokensPerSec
      : 2 * latencyCount;

    let apiEquivalentMonthlyCost = null;
    if (underlying) {
      const cachedShare = underlying.cachedInPrice != null ? cacheHitRate : 0;
      const monthlyInput = input * tasksPerMonth;
      const monthlyOutput = output * tasksPerMonth;
      const inCost =
        (monthlyInput * (1 - cachedShare) * underlying.inPrice +
          monthlyInput * cachedShare * (underlying.cachedInPrice || 0)) / 1e6;
      const outCost = (monthlyOutput * underlying.outPrice) / 1e6;
      let cost = inCost + outCost;
      if (batch) cost *= 0.5;
      apiEquivalentMonthlyCost = +cost.toFixed(2);
    }

    // quota utilization: spread the month's tokens evenly across reset windows
    const monthlyTaskTokens = (input + output) * tasksPerMonth;
    const windowsPerMonth = HOURS_PER_MONTH / tool.quotaWindowHours;
    const avgTokensPerWindow = monthlyTaskTokens / windowsPerMonth;
    const utilizationPct = +((avgTokensPerWindow / tool.quotaTokensPerWindow) * 100).toFixed(1);
    const seatsNeeded = Math.max(1, Math.ceil(utilizationPct / 100));
    // if usage is bunched into one window instead of spread evenly, how many
    // hours into the window would a single seat hit its cap?
    const hoursUntilQuotaExhausted =
      utilizationPct > 100 ? +(tool.quotaWindowHours / (utilizationPct / 100)).toFixed(1) : tool.quotaWindowHours;

    const monthlyPrice = tool.monthlyPrice * seatsNeeded;
    return {
      id: tool.id,
      name: tool.name,
      provider: tool.provider,
      product: tool.product,
      plan: tool.plan,
      quality,
      fitsContext,
      secondsPerTask: +secondsPerTask.toFixed(1),
      monthlyCost: { low: monthlyPrice, mid: monthlyPrice, high: monthlyPrice },
      costPerTask: +(monthlyPrice / tasksPerMonth).toFixed(4),
      apiEquivalentMonthlyCost,
      cheaperThanApiEquivalent: apiEquivalentMonthlyCost != null ? monthlyPrice < apiEquivalentMonthlyCost : null,
      valueScore: +(quality / Math.log10(monthlyPrice + 10)).toFixed(1),
      usageNote: tool.usageNote,
      quota: {
        windowHours: tool.quotaWindowHours,
        windowLabel: quotaWindowLabel(tool.quotaWindowHours),
        utilizationPct,
        seatsNeeded,
        hoursUntilQuotaExhausted
      }
    };
  });
  return results.sort((a, b) => b.valueScore - a.valueScore);
}

function estimateCode(params, models, codingTools = []) {
  const { taskKind = "feature", language = "typescript", codebaseSize = "medium", tasksPerMonth = 200, cacheHitRate = 0, batch = false } = params;
  const kind = CODE_TASKS[taskKind];
  if (!kind) throw new Error(`taskKind must be one of: ${Object.keys(CODE_TASKS).join(", ")}`);
  const sizeMult = CODEBASE_SIZE[codebaseSize];
  if (!sizeMult) throw new Error(`codebaseSize must be one of: ${Object.keys(CODEBASE_SIZE).join(", ")}`);
  if (tasksPerMonth <= 0) throw new Error("tasksPerMonth must be positive");

  const lang = String(language).toLowerCase();
  const langMult = VERBOSE_LANGS.includes(lang) ? 1.2 : TERSE_LANGS.includes(lang) ? 0.9 : 1.0;

  const input = Math.round(kind.inputTokens * sizeMult * kind.loops);
  const output = Math.round(kind.outputTokens * langMult * Math.max(1, kind.loops * 0.6));

  const results = modelResults({
    perTaskInput: input,
    perTaskOutput: output,
    tasksPerMonth, cacheHitRate, batch,
    latencyCount: kind.loops,
    qualityFor: (m) => m.quality.coding
  }, models);

  const { picks, recommendation } = picksAndRec(results);

  const codingToolResults = estimateCodingTools(
    { input, output, tasksPerMonth, cacheHitRate, batch, latencyCount: kind.loops },
    models,
    codingTools
  );
  const { picks: codingToolPicks, recommendation: codingToolRecommendation } = picksAndRec(codingToolResults);

  return {
    task: { type: "coding", label: `${kind.label} — ${language}, ${codebaseSize} codebase`, confidence: "high", loops: kind.loops },
    tokensPerTask: { input: range(input), output: range(output) },
    monthlyTokens: { input: range(input * tasksPerMonth), output: range(output * tasksPerMonth) },
    assumptions: { taskKind, language, codebaseSize, tasksPerMonth, cacheHitRate, batch, agentLoops: kind.loops, uncertainty: `±${RANGE * 100}%` },
    results: results.sort((a, b) => b.valueScore - a.valueScore),
    picks,
    recommendation,
    codingTools: codingToolResults,
    codingToolPicks,
    codingToolRecommendation,
    disclaimer: "Heuristic pre-launch estimates. Ranges reflect ±35% uncertainty; calibrate against real usage before committing budgets."
  };
}

module.exports = { estimate, estimateWorkflow, estimateCode, classifyTask, classifyTaskHeuristic, TASK_PROFILES, CODE_TASKS };

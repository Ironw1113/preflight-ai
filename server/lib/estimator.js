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

  const monthlyInput = perTask.input * tasksPerMonth;
  const monthlyOutput = perTask.output * tasksPerMonth;

  const results = models.map((m) => {
    const cachedShare = m.cachedInPrice != null ? cacheHitRate : 0;
    const inCost =
      (monthlyInput * (1 - cachedShare) * m.inPrice +
        monthlyInput * cachedShare * (m.cachedInPrice || 0)) / 1e6;
    const outCost = (monthlyOutput * m.outPrice) / 1e6;
    let monthlyCost = inCost + outCost;
    if (batch) monthlyCost *= 0.5;

    const quality = m.quality[profile.qualityKey];
    const secondsPerTask = m.latencyMs / 1000 + perTask.output / m.tokensPerSec;
    const fitsContext = perTask.input <= m.context;

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

  // recommendation: best quality, best value, cheapest acceptable (quality >= 80)
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

  return {
    task: { type: taskType, label: profile.label, confidence },
    tokensPerTask: { input: range(perTask.input), output: range(perTask.output) },
    monthlyTokens: { input: range(monthlyInput), output: range(monthlyOutput) },
    assumptions: { tasksPerMonth, avgInputWords, cacheHitRate, batch, wordsToTokens: WORDS_TO_TOKENS, uncertainty: `±${RANGE * 100}%` },
    results: results.sort((a, b) => b.valueScore - a.valueScore),
    picks: { bestQuality: bestQuality?.id || null, bestBudget: bestBudget?.id || null },
    recommendation,
    disclaimer: "Heuristic pre-launch estimates. Ranges reflect ±35% uncertainty; calibrate against real usage before committing budgets."
  };
}

module.exports = { estimate, classifyTask, classifyTaskHeuristic, TASK_PROFILES };

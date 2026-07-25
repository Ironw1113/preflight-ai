import React, { useState } from "react";

const fmt = (n) =>
  n >= 1000 ? "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "$" + n.toFixed(2);
const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : n);

const EXAMPLES = [
  "Summarize 500 customer support tickets into a daily digest",
  "Extract line items from vendor invoices into JSON",
  "Customer support chatbot answering questions from our help docs",
  "Translate product descriptions into French and German"
];

const CODE_KINDS = [
  { id: "bugfix", label: "Bug fix" },
  { id: "feature", label: "New feature" },
  { id: "refactor", label: "Refactor" },
  { id: "tests", label: "Write tests" },
  { id: "review", label: "Code review" },
  { id: "greenfield", label: "New project from scratch" }
];

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}

function ResultsTable({ result }) {
  const [sortBy, setSortBy] = useState("valueScore");
  const sorted = [...result.results].sort((a, b) =>
    sortBy === "monthlyCost"
      ? a.monthlyCost.mid - b.monthlyCost.mid
      : sortBy === "secondsPerTask"
        ? a.secondsPerTask - b.secondsPerTask
        : b[sortBy] - a[sortBy]
  );
  return (
    <div className="card">
      <div className="tablehead">
        <h2>Platform comparison</h2>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="valueScore">Sort: best value</option>
          <option value="quality">Sort: quality</option>
          <option value="monthlyCost">Sort: cheapest</option>
          <option value="secondsPerTask">Sort: fastest</option>
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>Model</th><th>Quality</th><th>Monthly cost (range)</th><th>Cost / run</th><th>Time / run</th><th>Value</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.id} className={m.id === result.picks.bestBudget ? "pick-budget" : m.id === result.picks.bestQuality ? "pick-quality" : ""}>
              <td>
                <strong>{m.name}</strong>
                <span className="provider">{m.provider}</span>
                {m.id === result.picks.bestQuality && <span className="badge q">top quality</span>}
                {m.id === result.picks.bestBudget && <span className="badge b">smart budget</span>}
                {!m.fitsContext && <span className="badge warn">context too small</span>}
              </td>
              <td>
                <div className="qbar"><div className="qfill" style={{ width: m.quality + "%" }} /></div>
                {m.quality}
              </td>
              <td>
                <strong>{fmt(m.monthlyCost.mid)}</strong>
                <span className="range">{fmt(m.monthlyCost.low)}–{fmt(m.monthlyCost.high)}</span>
              </td>
              <td>${m.costPerTask}</td>
              <td>{m.secondsPerTask}s</td>
              <td>{m.valueScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="disclaimer">{result.disclaimer}</p>
    </div>
  );
}

function SharedInputs({ tasksPerMonth, setTasksPerMonth, cacheHitRate, setCacheHitRate, batch, setBatch, volumeLabel, children }) {
  return (
    <div className="grid">
      <div>
        <label>{volumeLabel}</label>
        <input type="number" min="1" value={tasksPerMonth} onChange={(e) => setTasksPerMonth(e.target.value)} />
      </div>
      {children}
      <div>
        <label>Prompt cache hit rate: {(cacheHitRate * 100).toFixed(0)}%</label>
        <input type="range" min="0" max="0.9" step="0.1" value={cacheHitRate} onChange={(e) => setCacheHitRate(e.target.value)} />
      </div>
      <div className="checkbox">
        <label>
          <input type="checkbox" checked={batch} onChange={(e) => setBatch(e.target.checked)} /> Batch processing (~50% off)
        </label>
      </div>
    </div>
  );
}

function useEstimate() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const run = async (url, body) => {
    setLoading(true); setError(null);
    try { setResult(await postJson(url, body)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };
  return { result, loading, error, run };
}

function SingleMode() {
  const [description, setDescription] = useState("");
  const [tasksPerMonth, setTasksPerMonth] = useState(1000);
  const [avgInputWords, setAvgInputWords] = useState(500);
  const [cacheHitRate, setCacheHitRate] = useState(0);
  const [batch, setBatch] = useState(false);
  const { result, loading, error, run } = useEstimate();

  return (
    <>
      <form className="card" onSubmit={(e) => { e.preventDefault(); run("/api/estimate", { description, tasksPerMonth: +tasksPerMonth, avgInputWords: +avgInputWords, cacheHitRate: +cacheHitRate, batch }); }}>
        <label>Describe the task you want AI to do</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} required
          placeholder="e.g. Summarize 500 customer support tickets into a daily digest" />
        <div className="chips">
          {EXAMPLES.map((ex) => (
            <button type="button" key={ex} className="chip" onClick={() => setDescription(ex)}>{ex}</button>
          ))}
        </div>
        <SharedInputs {...{ tasksPerMonth, setTasksPerMonth, cacheHitRate, setCacheHitRate, batch, setBatch }} volumeLabel="Tasks per month">
          <div>
            <label>Avg input size (words)</label>
            <input type="number" min="1" value={avgInputWords} onChange={(e) => setAvgInputWords(e.target.value)} />
          </div>
        </SharedInputs>
        <button className="primary" disabled={loading}>{loading ? "Estimating…" : "Estimate cost across platforms"}</button>
        {error && <p className="error">{error}</p>}
      </form>

      {result && (
        <>
          <div className="card summary">
            <div>
              <span className="label">Detected task</span>
              <strong>{result.task.label}</strong>
              <span className={`conf conf-${result.task.confidence}`}>{result.task.confidence} confidence</span>
            </div>
            <div>
              <span className="label">Tokens per task (in / out)</span>
              <strong>{fmtTok(result.tokensPerTask.input.mid)} / {fmtTok(result.tokensPerTask.output.mid)}</strong>
            </div>
            <div>
              <span className="label">Monthly tokens (in / out)</span>
              <strong>{fmtTok(result.monthlyTokens.input.mid)} / {fmtTok(result.monthlyTokens.output.mid)}</strong>
            </div>
          </div>
          {result.recommendation && <div className="rec">💡 {result.recommendation}</div>}
          <ResultsTable result={result} />
        </>
      )}
    </>
  );
}

function WorkflowMode() {
  const [steps, setSteps] = useState([
    { description: "", avgInputWords: 500 },
    { description: "", avgInputWords: 500 }
  ]);
  const [tasksPerMonth, setTasksPerMonth] = useState(500);
  const [cacheHitRate, setCacheHitRate] = useState(0);
  const [batch, setBatch] = useState(false);
  const { result, loading, error, run } = useEstimate();

  const setStep = (i, field, value) =>
    setSteps(steps.map((s, j) => (j === i ? { ...s, [field]: value } : s)));

  return (
    <>
      <form className="card" onSubmit={(e) => { e.preventDefault(); run("/api/estimate-workflow", { steps: steps.map((s) => ({ description: s.description, avgInputWords: +s.avgInputWords })), tasksPerMonth: +tasksPerMonth, cacheHitRate: +cacheHitRate, batch }); }}>
        <label>Define each step of your workflow — later steps automatically carry the context of earlier ones. Second number = avg input words for that step.</label>
        {steps.map((s, i) => (
          <div className="step" key={i}>
            <span className="stepnum">{i + 1}</span>
            <input type="text" value={s.description} required placeholder={i === 0 ? "e.g. Extract data from the invoice" : i === 1 ? "e.g. Validate extracted data against the purchase order" : "Describe this step"} onChange={(e) => setStep(i, "description", e.target.value)} />
            <input className="words" type="number" min="1" title="Avg input words for this step" value={s.avgInputWords} onChange={(e) => setStep(i, "avgInputWords", e.target.value)} />
            {steps.length > 1 && (
              <button type="button" className="remove" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>✕</button>
            )}
          </div>
        ))}
        {steps.length < 12 && (
          <button type="button" className="chip add" onClick={() => setSteps([...steps, { description: "", avgInputWords: 500 }])}>+ Add step</button>
        )}
        <SharedInputs {...{ tasksPerMonth, setTasksPerMonth, cacheHitRate, setCacheHitRate, batch, setBatch }} volumeLabel="Workflow runs per month" />
        <button className="primary" disabled={loading}>{loading ? "Estimating…" : "Estimate workflow cost"}</button>
        {error && <p className="error">{error}</p>}
      </form>

      {result && (
        <>
          <div className="card">
            <h2>Step breakdown (per run)</h2>
            <table>
              <thead>
                <tr><th>Step</th><th>Detected type</th><th>Input tokens</th><th>Output tokens</th></tr>
              </thead>
              <tbody>
                {result.workflow.steps.map((s) => (
                  <tr key={s.step}>
                    <td><strong>{s.step}.</strong> {s.description}</td>
                    <td>{s.label}</td>
                    <td>{fmtTok(s.tokens.input.mid)}</td>
                    <td>{fmtTok(s.tokens.output.mid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="disclaimer">Input tokens grow step by step because each step re-reads previous outputs (context accumulation). Totals per run: {fmtTok(result.tokensPerRun.input.mid)} in / {fmtTok(result.tokensPerRun.output.mid)} out.</p>
          </div>

          {result.mixedRecommendation && <div className="rec">🧩 {result.mixedRecommendation}</div>}
          {result.recommendation && <div className="rec">💡 {result.recommendation}</div>}

          {result.mixedPlan && (
            <div className="card">
              <h2>Cheapest per-step model mix (quality ≥ 85)</h2>
              <table>
                <thead><tr><th>Step</th><th>Model</th><th>Quality</th><th>Monthly cost</th></tr></thead>
                <tbody>
                  {result.mixedPlan.map((p) => (
                    <tr key={p.step}>
                      <td>{p.step}. {p.label}</td>
                      <td><strong>{p.model}</strong></td>
                      <td>{p.quality}</td>
                      <td>{fmt(p.monthlyCost)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3}><strong>Mixed total</strong></td>
                    <td><strong>{fmt(result.mixedMonthly)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <ResultsTable result={result} />
        </>
      )}
    </>
  );
}

function CodeMode() {
  const [taskKind, setTaskKind] = useState("feature");
  const [language, setLanguage] = useState("typescript");
  const [codebaseSize, setCodebaseSize] = useState("medium");
  const [tasksPerMonth, setTasksPerMonth] = useState(200);
  const [cacheHitRate, setCacheHitRate] = useState(0);
  const [batch, setBatch] = useState(false);
  const { result, loading, error, run } = useEstimate();

  return (
    <>
      <form className="card" onSubmit={(e) => { e.preventDefault(); run("/api/estimate-code", { taskKind, language, codebaseSize, tasksPerMonth: +tasksPerMonth, cacheHitRate: +cacheHitRate, batch }); }}>
        <div className="grid">
          <div>
            <label>Coding task type</label>
            <select value={taskKind} onChange={(e) => setTaskKind(e.target.value)}>
              {CODE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <label>Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {["typescript", "javascript", "python", "java", "c#", "go", "ruby", "c++", "other"].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label>Codebase size</label>
            <select value={codebaseSize} onChange={(e) => setCodebaseSize(e.target.value)}>
              <option value="small">Small (&lt;10K lines)</option>
              <option value="medium">Medium (10–100K lines)</option>
              <option value="large">Large (100K+ lines)</option>
            </select>
          </div>
        </div>
        <SharedInputs {...{ tasksPerMonth, setTasksPerMonth, cacheHitRate, setCacheHitRate, batch, setBatch }} volumeLabel="Coding tasks per month" />
        <button className="primary" disabled={loading}>{loading ? "Estimating…" : "Estimate coding cost across all AIs"}</button>
        {error && <p className="error">{error}</p>}
      </form>

      {result && (
        <>
          <div className="card summary">
            <div>
              <span className="label">Task</span>
              <strong>{result.task.label}</strong>
            </div>
            <div>
              <span className="label">Agent loops per task</span>
              <strong>{result.task.loops}×</strong>
            </div>
            <div>
              <span className="label">Tokens per task (in / out)</span>
              <strong>{fmtTok(result.tokensPerTask.input.mid)} / {fmtTok(result.tokensPerTask.output.mid)}</strong>
            </div>
            <div>
              <span className="label">Monthly tokens (in / out)</span>
              <strong>{fmtTok(result.monthlyTokens.input.mid)} / {fmtTok(result.monthlyTokens.output.mid)}</strong>
            </div>
          </div>
          {result.recommendation && <div className="rec">💡 {result.recommendation}</div>}
          <ResultsTable result={result} />
        </>
      )}
    </>
  );
}

export default function App() {
  const [mode, setMode] = useState("single");
  return (
    <div className="wrap">
      <header>
        <h1>Preflight <span className="accent">AI</span></h1>
        <p className="tagline">Know your AI bill before you run the task.</p>
      </header>
      <div className="tabs">
        <button className={mode === "single" ? "tab active" : "tab"} onClick={() => setMode("single")}>Single task</button>
        <button className={mode === "workflow" ? "tab active" : "tab"} onClick={() => setMode("workflow")}>Multi-step workflow</button>
        <button className={mode === "code" ? "tab active" : "tab"} onClick={() => setMode("code")}>Code estimator</button>
      </div>
      {mode === "single" && <SingleMode />}
      {mode === "workflow" && <WorkflowMode />}
      {mode === "code" && <CodeMode />}
    </div>
  );
}

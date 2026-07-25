import React, { useState } from "react";

const fmt = (n) =>
  n >= 1000 ? "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "$" + n.toFixed(2);
const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : n);

const EXAMPLES = [
  "Summarize 500 customer support tickets into a daily digest",
  "Generate React components and unit tests from Figma specs",
  "Extract line items from vendor invoices into JSON",
  "Customer support chatbot answering questions from our help docs",
  "Translate product descriptions into French and German"
];

export default function App() {
  const [description, setDescription] = useState("");
  const [tasksPerMonth, setTasksPerMonth] = useState(1000);
  const [avgInputWords, setAvgInputWords] = useState(500);
  const [cacheHitRate, setCacheHitRate] = useState(0);
  const [batch, setBatch] = useState(false);
  const [sortBy, setSortBy] = useState("valueScore");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function run(e) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          tasksPerMonth: +tasksPerMonth,
          avgInputWords: +avgInputWords,
          cacheHitRate: +cacheHitRate,
          batch
        })
      });
      if (!res.ok) throw new Error((await res.json()).error || "Request failed");
      setResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const sorted = result
    ? [...result.results].sort((a, b) =>
        sortBy === "monthlyCost"
          ? a.monthlyCost.mid - b.monthlyCost.mid
          : sortBy === "secondsPerTask"
            ? a.secondsPerTask - b.secondsPerTask
            : b[sortBy] - a[sortBy]
      )
    : [];

  return (
    <div className="wrap">
      <header>
        <h1>
          Preflight <span className="accent">AI</span>
        </h1>
        <p className="tagline">Know your AI bill before you run the task.</p>
      </header>

      <form className="card" onSubmit={run}>
        <label>Describe the task you want AI to do</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Summarize 500 customer support tickets into a daily digest"
          rows={3}
          required
        />
        <div className="chips">
          {EXAMPLES.map((ex) => (
            <button type="button" key={ex} className="chip" onClick={() => setDescription(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <div className="grid">
          <div>
            <label>Tasks per month</label>
            <input type="number" min="1" value={tasksPerMonth} onChange={(e) => setTasksPerMonth(e.target.value)} />
          </div>
          <div>
            <label>Avg input size (words)</label>
            <input type="number" min="1" value={avgInputWords} onChange={(e) => setAvgInputWords(e.target.value)} />
          </div>
          <div>
            <label>Prompt cache hit rate: {(cacheHitRate * 100).toFixed(0)}%</label>
            <input type="range" min="0" max="0.9" step="0.1" value={cacheHitRate} onChange={(e) => setCacheHitRate(e.target.value)} />
          </div>
          <div className="checkbox">
            <label>
              <input type="checkbox" checked={batch} onChange={(e) => setBatch(e.target.checked)} /> Batch processing
              (async, ~50% off)
            </label>
          </div>
        </div>
        <button className="primary" disabled={loading}>
          {loading ? "Estimating…" : "Estimate cost across platforms"}
        </button>
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
              <strong>
                {fmtTok(result.tokensPerTask.input.mid)} / {fmtTok(result.tokensPerTask.output.mid)}
              </strong>
            </div>
            <div>
              <span className="label">Monthly tokens (in / out)</span>
              <strong>
                {fmtTok(result.monthlyTokens.input.mid)} / {fmtTok(result.monthlyTokens.output.mid)}
              </strong>
            </div>
          </div>

          {result.recommendation && <div className="rec">💡 {result.recommendation}</div>}

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
                  <th>Model</th>
                  <th>Quality</th>
                  <th>Monthly cost (range)</th>
                  <th>Cost / task</th>
                  <th>Time / task</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr
                    key={m.id}
                    className={
                      m.id === result.picks.bestBudget ? "pick-budget" : m.id === result.picks.bestQuality ? "pick-quality" : ""
                    }
                  >
                    <td>
                      <strong>{m.name}</strong>
                      <span className="provider">{m.provider}</span>
                      {m.id === result.picks.bestQuality && <span className="badge q">top quality</span>}
                      {m.id === result.picks.bestBudget && <span className="badge b">smart budget</span>}
                      {!m.fitsContext && <span className="badge warn">context too small</span>}
                    </td>
                    <td>
                      <div className="qbar">
                        <div className="qfill" style={{ width: m.quality + "%" }} />
                      </div>
                      {m.quality}
                    </td>
                    <td>
                      <strong>{fmt(m.monthlyCost.mid)}</strong>
                      <span className="range">
                        {fmt(m.monthlyCost.low)}–{fmt(m.monthlyCost.high)}
                      </span>
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
        </>
      )}
    </div>
  );
}

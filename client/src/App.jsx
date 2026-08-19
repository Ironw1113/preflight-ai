import React, { useState, useEffect } from "react";
import Landing, { SiteNav } from "./Landing.jsx";

const fmt = (n) =>
  n >= 1000 ? "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "$" + n.toFixed(2);
const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : n);

const EXAMPLES = [
  "Summarize 500 customer support tickets into a daily digest",
  "Extract line items from vendor invoices into JSON",
  "Customer support chatbot answering questions from our help docs",
  "Translate product descriptions into French and German"
];

const CODE_EXAMPLES = [
  "Fix the crash when a user submits an empty form",
  "Add support for exporting reports to CSV",
  "Refactor the payment module to reduce technical debt",
  "Write unit tests for the authentication flow"
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

const RISK_LABELS = { low: "Low variance", medium: "Medium variance", high: "High variance", "very-high": "Very high variance" };

function RiskBanner({ risk }) {
  if (!risk) return null;
  return (
    <div className={`risk-banner risk-${risk.level}`}>
      <span className={`risk-chip risk-chip-${risk.level}`}>{RISK_LABELS[risk.level] || risk.level}</span>
      <span className="risk-mults">P90 ≈ {risk.p90Mult}× median · blowout ≈ {risk.blowoutMult}× median</span>
      {risk.warning && <p className="risk-text">⚠️ {risk.warning}</p>}
    </div>
  );
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
      <RiskBanner risk={result.risk} />
      <table>
        <thead>
          <tr>
            <th>Model</th><th>Quality</th><th>Monthly P50</th><th>P90</th><th>Blowout</th><th>Cost / run</th><th>Time / run</th><th>Value</th>
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
                <strong>{fmt(m.scenarios ? m.scenarios.p50 : m.monthlyCost.mid)}</strong>
                <span className="range">{fmt(m.monthlyCost.low)}–{fmt(m.monthlyCost.high)}</span>
              </td>
              <td className="p90">{m.scenarios ? fmt(m.scenarios.p90) : "—"}</td>
              <td className="blowout">{m.scenarios ? fmt(m.scenarios.blowout) : "—"}</td>
              <td>${m.costPerTask}</td>
              <td>{m.secondsPerTask}s</td>
              <td>{m.valueScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="disclaimer">P50 = median expectation. P90 = 9 in 10 months land at or below this — budget to it. Blowout = the runaway-agent scenario your budget cap should survive. {result.disclaimer}</p>
    </div>
  );
}

function CodingToolsTable({ result }) {
  const [sortBy, setSortBy] = useState("valueScore");
  const tools = result.codingTools || [];
  if (tools.length === 0) return null;
  const sorted = [...tools].sort((a, b) =>
    sortBy === "monthlyCost"
      ? a.monthlyCost.mid - b.monthlyCost.mid
      : sortBy === "secondsPerTask"
        ? a.secondsPerTask - b.secondsPerTask
        : b[sortBy] - a[sortBy]
  );
  return (
    <div className="card">
      <div className="tablehead">
        <h2>Coding agent subscriptions</h2>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="valueScore">Sort: best value</option>
          <option value="quality">Sort: quality</option>
          <option value="monthlyCost">Sort: cheapest</option>
          <option value="secondsPerTask">Sort: fastest</option>
        </select>
      </div>
      <div className="tool-grid">
        {sorted.map((t) => (
          <div
            key={t.id}
            className={`tool-card ${t.id === result.codingToolPicks?.bestBudget ? "pick-budget" : t.id === result.codingToolPicks?.bestQuality ? "pick-quality" : ""}`}
          >
            <div className="tool-head">
              <div>
                <strong>{t.product} — {t.plan}</strong>
                <span className="provider">{t.provider}</span>
              </div>
              <div className="tool-badges">
                {t.id === result.codingToolPicks?.bestQuality && <span className="badge q">top quality</span>}
                {t.id === result.codingToolPicks?.bestBudget && <span className="badge b">smart budget</span>}
              </div>
            </div>
            <p className="tool-note">{t.usageNote}</p>
            <div className="qbar-row">
              <div className="qbar"><div className="qfill" style={{ width: t.quality + "%" }} /></div>
              <span>{t.quality} quality</span>
            </div>
            <div className="quota-row">
              <div className="quota-bar">
                <div className={`quota-fill ${t.quota.utilizationPct > 100 ? "over" : ""}`} style={{ width: Math.min(100, t.quota.utilizationPct) + "%" }} />
              </div>
              <span className="quota-label">{t.quota.utilizationPct}% of {t.quota.windowLabel} quota (1 seat)</span>
              {t.quota.utilizationPct > 100 ? (
                <p className="quota-note warn">
                  Exceeds a single seat — averages out to hitting the cap ~{t.quota.hoursUntilQuotaExhausted}h into each {t.quota.windowLabel} window.
                  Needs {t.quota.seatsNeeded} seats to sustain this volume without getting capped.
                </p>
              ) : (
                <p className="quota-note ok">Fits within one seat's {t.quota.windowLabel} quota.</p>
              )}
            </div>
            <div className="tool-prices">
              <div className="price-box">
                <span className="label">Monthly price</span>
                <strong>{fmt(t.monthlyCost.mid)}</strong>
                <span className="range">{t.quota.seatsNeeded > 1 ? `flat, ${t.quota.seatsNeeded} seats` : "flat, per seat"}</span>
              </div>
              <div className="price-box">
                <span className="label">vs. metered API</span>
                {t.apiEquivalentMonthlyCost != null ? (
                  <>
                    <strong>{fmt(t.apiEquivalentMonthlyCost)}</strong>
                    <span className={`badge ${t.cheaperThanApiEquivalent ? "b" : "warn"}`}>
                      {t.cheaperThanApiEquivalent ? "subscription cheaper" : "API cheaper"}
                    </span>
                  </>
                ) : (
                  <span className="range">n/a — mixed models</span>
                )}
              </div>
            </div>
            <div className="tool-footer">
              <span>{t.secondsPerTask}s / run</span>
              <span>Value {t.valueScore}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="disclaimer">
        Monthly price is the tool's real flat subscription cost, scaled up to however many seats your volume needs.
        "vs. metered API" is what the same token volume would cost paying per-token through the tool's underlying
        model. Usage-quota sizes are heuristic assumptions (providers rarely publish exact token-equivalent limits) —
        treat the quota bar as directional, not exact.
      </p>
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

const UPLOAD_ACCEPT = ".txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.rb,.go,.java,.c,.cpp,.h,.hpp,.cs,.php,.html,.css,.yml,.yaml,.xml,.sql,.sh,.pdf,.docx,.xlsx,.xls";

function FileUpload({ file, onFile, onClear, uploading, uploadError }) {
  return (
    <div className="file-upload">
      <label>Or upload the file you want the task run on (optional)</label>
      {!file ? (
        <input
          type="file"
          accept={UPLOAD_ACCEPT}
          disabled={uploading}
          onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
        />
      ) : (
        <div className="file-chip">
          <span>📎 {file.fileName} — {file.wordCount.toLocaleString()} words</span>
          <button type="button" className="chip" onClick={onClear}>Remove</button>
        </div>
      )}
      {uploading && <p className="disclaimer">Reading file…</p>}
      {uploadError && <p className="error">{uploadError}</p>}
    </div>
  );
}

function ProjectUpload({ project, onFiles, onClear, uploading, uploadError }) {
  return (
    <div className="file-upload">
      <label>Upload the code you're working on (optional) — select files, or a whole folder</label>
      {!project ? (
        <div className="upload-row">
          <div className="upload-option">
            <span className="upload-option-label">Files</span>
            <input
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              disabled={uploading}
              onChange={(e) => e.target.files.length > 0 && onFiles(Array.from(e.target.files))}
            />
          </div>
          <div className="upload-option">
            <span className="upload-option-label">Folder</span>
            <input
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              disabled={uploading}
              onChange={(e) => e.target.files.length > 0 && onFiles(Array.from(e.target.files))}
            />
          </div>
        </div>
      ) : (
        <div className="file-chip">
          <span>
            📁 {project.fileCount} file{project.fileCount === 1 ? "" : "s"} read
            {project.skippedCount > 0 ? `, ${project.skippedCount} excluded` : ""}
            {" — "}{project.totalWordCount.toLocaleString()} words
          </span>
          <button type="button" className="chip" onClick={onClear}>Remove</button>
        </div>
      )}
      {uploading && <p className="disclaimer">Reading files…</p>}
      {uploadError && <p className="error">{uploadError}</p>}
    </div>
  );
}

function SingleMode() {
  const [description, setDescription] = useState("");
  const [tasksPerMonth, setTasksPerMonth] = useState(1000);
  const [avgInputWords, setAvgInputWords] = useState(500);
  const [cacheHitRate, setCacheHitRate] = useState(0);
  const [batch, setBatch] = useState(false);
  const [file, setFile] = useState(null);
  const [fileSnippet, setFileSnippet] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const { result, loading, error, run } = useEstimate();

  async function handleFile(selected) {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", selected);
      const res = await fetch("/api/extract-text", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to read file");
      setFile(data);
      setFileSnippet(data.snippet);
      setAvgInputWords(data.wordCount || 1);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function clearFile() {
    setFile(null);
    setFileSnippet(null);
  }

  return (
    <>
      <form className="card" onSubmit={(e) => { e.preventDefault(); run("/api/estimate", { description, tasksPerMonth: +tasksPerMonth, avgInputWords: +avgInputWords, cacheHitRate: +cacheHitRate, batch, fileSnippet }); }}>
        <label>Describe the task you want AI to do</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} required
          placeholder="e.g. Summarize 500 customer support tickets into a daily digest" />
        <div className="chips">
          {EXAMPLES.map((ex) => (
            <button type="button" key={ex} className="chip" onClick={() => setDescription(ex)}>{ex}</button>
          ))}
        </div>
        <FileUpload file={file} onFile={handleFile} onClear={clearFile} uploading={uploading} uploadError={uploadError} />
        <SharedInputs {...{ tasksPerMonth, setTasksPerMonth, cacheHitRate, setCacheHitRate, batch, setBatch }} volumeLabel="Tasks per month">
          <div>
            <label>Avg input size (words){file && " — auto-detected from file"}</label>
            <input type="number" min="1" value={avgInputWords} onChange={(e) => setAvgInputWords(e.target.value)} />
          </div>
        </SharedInputs>
        <button className="primary" disabled={loading || uploading}>{loading ? "Estimating…" : "Estimate cost across platforms"}</button>
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
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("typescript");
  const [codebaseSize, setCodebaseSize] = useState("medium");
  const [tasksPerMonth, setTasksPerMonth] = useState(200);
  const [cacheHitRate, setCacheHitRate] = useState(0);
  const [batch, setBatch] = useState(false);
  const [project, setProject] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const { result, loading, error, run } = useEstimate();

  async function handleFiles(files) {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      // relative paths travel separately — multipart/form-data reduces a
      // filename containing "/" to its basename, so they can't ride along
      // on each file's own filename (see the server route's comment)
      const paths = files.map((f) => f.webkitRelativePath || f.name);
      files.forEach((f) => formData.append("files", f));
      formData.append("paths", JSON.stringify(paths));
      const res = await fetch("/api/extract-project", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to read files");
      setProject(data);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <form className="card" onSubmit={(e) => {
        e.preventDefault();
        run("/api/estimate-code", {
          description,
          language, codebaseSize,
          tasksPerMonth: +tasksPerMonth, cacheHitRate: +cacheHitRate, batch,
          fileWordCount: project ? project.totalWordCount : undefined,
          fileSnippet: project ? project.snippet : undefined
        });
      }}>
        <label>Describe the code change you want to make (required, even if you upload files below)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          placeholder="e.g. Add support for exporting reports to CSV" />
        <div className="chips">
          {CODE_EXAMPLES.map((ex) => (
            <button type="button" key={ex} className="chip" onClick={() => setDescription(ex)}>{ex}</button>
          ))}
        </div>
        <ProjectUpload project={project} onFiles={handleFiles} onClear={() => setProject(null)} uploading={uploading} uploadError={uploadError} />
        <div className="grid">
          <div>
            <label>Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {["typescript", "javascript", "python", "java", "c#", "go", "ruby", "c++", "other"].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label>Codebase size{project && " (still applies — surrounding files not in your upload)"}</label>
            <select value={codebaseSize} onChange={(e) => setCodebaseSize(e.target.value)}>
              <option value="small">Small (&lt;10K lines)</option>
              <option value="medium">Medium (10–100K lines)</option>
              <option value="large">Large (100K+ lines)</option>
            </select>
          </div>
        </div>
        <SharedInputs {...{ tasksPerMonth, setTasksPerMonth, cacheHitRate, setCacheHitRate, batch, setBatch }} volumeLabel="Coding tasks per month" />
        <button className="primary" disabled={loading || uploading}>{loading ? "Estimating…" : "Estimate coding cost across all AIs"}</button>
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
              <span className="label">Agent loops per task</span>
              <strong>{result.task.loops}×</strong>
            </div>
            <div>
              <span className="label">Tokens per task (in / out){result.assumptions?.fileWordCount != null && " — from uploaded project"}</span>
              <strong>{fmtTok(result.tokensPerTask.input.mid)} / {fmtTok(result.tokensPerTask.output.mid)}</strong>
            </div>
            <div>
              <span className="label">Monthly tokens (in / out)</span>
              <strong>{fmtTok(result.monthlyTokens.input.mid)} / {fmtTok(result.monthlyTokens.output.mid)}</strong>
            </div>
          </div>
          {result.recommendation && <div className="rec">💡 {result.recommendation}</div>}
          <CodingToolsTable result={result} />
          {result.codingToolRecommendation && <div className="rec">🧑‍💻 {result.codingToolRecommendation}</div>}
          <ResultsTable result={result} />
        </>
      )}
    </>
  );
}

function EstimatorApp() {
  const [mode, setMode] = useState("single");
  return (
    <>
      <SiteNav inApp />
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
    </>
  );
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => {
      setRoute(window.location.hash);
      if (window.location.hash.startsWith("#/")) window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route.startsWith("#/app") ? <EstimatorApp /> : <Landing />;
}

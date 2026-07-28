import React from "react";

export function SiteNav({ inApp = false }) {
  return (
    <nav className="sitenav">
      <a className="sitenav-logo" href="#/">
        <span className="logo-mark">◭</span> Preflight <span className="accent">AI</span>
      </a>
      <div className="sitenav-links">
        {!inApp && (
          <>
            <a href="#how">How it works</a>
            <a href="#product">Product</a>
            <a href="#pricing">Pricing</a>
          </>
        )}
        {inApp && <a href="#/">← Home</a>}
      </div>
      <a className="sitenav-cta" href="#/app">{inApp ? "Estimator" : "Open the app"}</a>
    </nav>
  );
}

const STATS = [
  { big: "5–30×", small: "more tokens burned by AI agents vs. a single call" },
  { big: "80%", small: "of enterprises miss AI cost forecasts by more than 25%" },
  { big: "$1M+", small: "average surprise spend when a large AI budget misses" },
  { big: "15+", small: "models and coding agents compared side by side" }
];

const SCENARIOS = [
  { tag: "P50", tone: "p50", title: "Expect the P50", text: "The median month. Half your months land under it — a fine expectation, a terrible budget." },
  { tag: "P90", tone: "p90", title: "Budget the P90", text: "9 in 10 months come in at or below this. The number you defend to finance." },
  { tag: "30×", tone: "blowout", title: "Cap at the blowout", text: "The runaway-agent scenario. You don't budget it — you set a hard cap so it can't happen." }
];

const LOOP = [
  { n: "01", title: "Predict", text: "Describe any task, multi-step workflow, or coding job in plain language. Get token, cost, quality, and time forecasts across every major platform — with honest variance, not a single fake-precise number." },
  { n: "02", title: "Approve", text: "Turn an estimate into a budget request: owner, P90 budget, blowout cap, justification. Managers approve in-app with a timestamped audit trail and a one-page sign-off document." },
  { n: "03", title: "Enforce", text: "Export the approved budget as guardrail config for your gateway (LiteLLM, Portkey) — caps and alert thresholds your infrastructure actually enforces." },
  { n: "04", title: "Learn", text: "Run your real sample tasks across models and compare measured tokens to our predictions. Every estimate calibrates the next one." }
];

const FEATURES = [
  { title: "Task estimator", text: "Plain-language task → per-model P50/P90/blowout monthly cost, quality score, and time per run. Claude-powered task classification." },
  { title: "Multi-step workflows", text: "Chain-aware math: each step carries the context of the ones before it — the accumulation that makes real pipelines expensive." },
  { title: "Mixed-model plans", text: "The cheapest model per step at quality ≥ 85. Routinely 90%+ savings vs. running everything on the flagship." },
  { title: "Code estimator", text: "Bug fix to greenfield: agent-loop multipliers by task kind, language, and codebase size — across APIs and coding-agent subscriptions with seat/quota math." },
  { title: "Approval workflow", text: "Budget requests, approve/reject with audit trail, printable sign-off. The artifact finance already asks for, one click away." },
  { title: "Guardrail export", text: "Approved budgets become enforceable gateway config — caps, 80%/100% alerts. Coming next.", soon: true }
];

const TIERS = [
  { name: "Free", price: "$0", note: "forever", items: ["All three estimators", "P50 / P90 / blowout on every result", "15+ models & coding agents", "Verified pricing data"] },
  { name: "Pro", price: "$29", note: "per user / month", items: ["Saved scenarios", "PDF & CSV exports", "Price-change re-forecasts", "Email alerts"], featured: true },
  { name: "Team", price: "$199", note: "per month, 10 seats", items: ["Approval workflow + audit trail", "Budget dashboard", "Guardrail config export", "Bring-your-own-eval runs"] }
];

export default function Landing() {
  return (
    <div className="landing">
      <SiteNav />

      <header className="hero">
        <p className="eyebrow">The pre-approval layer for AI spend</p>
        <h1>Know your AI bill<br /><span className="accent">before</span> you run it.</h1>
        <p className="hero-sub">
          AI agents burn 5–30× the tokens anyone plans for, and most companies find out from the invoice.
          Preflight forecasts what a task will really cost — with the variance shown honestly — then turns
          that forecast into an approved, capped budget your team can't accidentally blow through.
        </p>
        <div className="hero-ctas">
          <a className="btn-primary" href="#/app">Estimate a task — free</a>
          <a className="btn-ghost" href="#how">See how it works</a>
        </div>
        <p className="hero-note">No sign-up. No API key required. Pricing verified from official provider pages.</p>
      </header>

      <section className="stats">
        {STATS.map((s) => (
          <div className="stat" key={s.big}>
            <span className="stat-big">{s.big}</span>
            <span className="stat-small">{s.small}</span>
          </div>
        ))}
      </section>

      <section className="scenarios" id="variance">
        <h2>One number is a lie. We show you three.</h2>
        <p className="section-sub">Every estimate ships with the full picture — the same discipline actuaries and cloud-capacity planners have used for decades, finally applied to AI spend.</p>
        <div className="scenario-cards">
          {SCENARIOS.map((s) => (
            <div className={`scenario-card tone-${s.tone}`} key={s.tag}>
              <span className="scenario-tag">{s.tag}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="loop" id="how">
        <h2>Predict → Approve → Enforce → Learn</h2>
        <p className="section-sub">Observability tools tell you what you spent. Preflight owns the moment before the money leaves.</p>
        <div className="loop-grid">
          {LOOP.map((s) => (
            <div className="loop-card" key={s.n}>
              <span className="loop-num">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="features" id="product">
        <h2>Everything in the box today</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <h3>{f.title} {f.soon && <span className="soon">soon</span>}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pricing" id="pricing">
        <h2>Pricing</h2>
        <div className="tier-grid">
          {TIERS.map((t) => (
            <div className={`tier-card ${t.featured ? "featured" : ""}`} key={t.name}>
              <h3>{t.name}</h3>
              <p className="tier-price">{t.price} <span>{t.note}</span></p>
              <ul>
                {t.items.map((i) => <li key={i}>{i}</li>)}
              </ul>
              <a className={t.featured ? "btn-primary" : "btn-ghost"} href="#/app">
                {t.name === "Free" ? "Start estimating" : "Get started"}
              </a>
            </div>
          ))}
        </div>
      </section>

      <section className="closing">
        <h2>Expect the P50. Budget the P90.<br />Cap at the blowout.</h2>
        <a className="btn-primary" href="#/app">Run your first estimate</a>
      </section>

      <footer className="sitefooter">
        <div>
          <strong>Preflight AI</strong>
          <p>The pre-approval layer for AI spend.</p>
        </div>
        <p className="footer-fine">
          Pricing verified from official provider pages (July 2026). Estimates are heuristic until calibrated
          against your real usage — ranges reflect that honestly. © 2026 Preflight AI.
        </p>
      </footer>
    </div>
  );
}

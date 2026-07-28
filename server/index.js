const express = require("express");
const path = require("path");
const { estimate, estimateWorkflow, estimateCode, CODE_TASKS } = require("./lib/estimator");
const { createApproval, listApprovals, getApproval, decideApproval } = require("./lib/approvals");
const { renderSignoffDoc } = require("./lib/signoffDoc");
const data = require("./data/models.json");

const app = express();
app.use(express.json());

// serve built client in production
app.use(express.static(path.join(__dirname, "..", "client", "dist")));

app.get("/api/models", (_req, res) => {
  res.json({ updated: data.updated, source: data.pricingSource, models: data.models });
});

app.post("/api/estimate", async (req, res) => {
  try {
    const result = await estimate(req.body || {}, data.models);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/estimate-workflow", async (req, res) => {
  try {
    const result = await estimateWorkflow(req.body || {}, data.models);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/code-tasks", (_req, res) => {
  res.json(Object.entries(CODE_TASKS).map(([id, t]) => ({ id, label: t.label })));
});

app.post("/api/estimate-code", (req, res) => {
  try {
    const result = estimateCode(req.body || {}, data.models, data.codingTools);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/approvals", async (req, res) => {
  try {
    const result = await createApproval(req.body || {}, data.models, data.codingTools);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/approvals", (_req, res) => {
  res.json(listApprovals());
});

app.get("/api/approvals/:id", (req, res) => {
  try {
    res.json(getApproval(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.post("/api/approvals/:id/decide", (req, res) => {
  try {
    res.json(decideApproval(req.params.id, req.body || {}));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/approvals/:id/print", (req, res) => {
  try {
    const approval = getApproval(req.params.id);
    res.type("html").send(renderSignoffDoc(approval));
  } catch (err) {
    res.status(404).send(`<p>${err.message}</p>`);
  }
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Preflight API on http://localhost:${PORT}`));
}
module.exports = app;

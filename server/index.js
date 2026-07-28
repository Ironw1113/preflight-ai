const express = require("express");
const path = require("path");
const multer = require("multer");
const { estimate, estimateWorkflow, estimateCode, CODE_TASKS } = require("./lib/estimator");
const { createApproval, listApprovals, getApproval, decideApproval } = require("./lib/approvals");
const { renderSignoffDoc } = require("./lib/signoffDoc");
const { liteLLMConfig, portkeyConfig, genericWebhookConfig, slug } = require("./lib/guardrailConfig");
const { extractText } = require("./lib/fileExtract");
const data = require("./data/models.json");

const app = express();
app.use(express.json());

// memory storage only — uploaded files are parsed for text and discarded,
// never written to disk
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

// Extracts text from an uploaded file (multipart field "file") so the
// estimator can use the real word count instead of a guessed one, and a
// bounded content snippet to help classify the task type. The file itself
// is never persisted — see the multer memoryStorage config above.
app.post("/api/extract-text", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required (multipart field 'file')" });
  try {
    const result = await extractText(req.file.buffer, req.file.originalname, req.file.mimetype);
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

const GUARDRAIL_GENERATORS = {
  litellm: { fn: liteLLMConfig, contentType: "text/yaml", ext: "yaml" },
  portkey: { fn: portkeyConfig, contentType: "application/json", ext: "json" },
  webhook: { fn: genericWebhookConfig, contentType: "application/json", ext: "json" }
};

app.get("/api/approvals/:id/guardrails/:format", (req, res) => {
  const gen = GUARDRAIL_GENERATORS[req.params.format];
  if (!gen) {
    return res.status(400).json({ error: `format must be one of: ${Object.keys(GUARDRAIL_GENERATORS).join(", ")}` });
  }
  try {
    const approval = getApproval(req.params.id);
    if (approval.status !== "approved") {
      return res.status(400).json({ error: "guardrail config is only available for approved requests" });
    }
    const content = gen.fn(approval);
    res.type(gen.contentType);
    if (req.query.download) {
      res.set("Content-Disposition", `attachment; filename="${req.params.format}-${slug(approval.name)}.${gen.ext}"`);
    }
    res.send(content);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// multer errors (e.g. file too large) reach here via next(err), not the
// route handler's own try/catch
app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "File too large (max 5MB)" : err.message;
    return res.status(400).json({ error: message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Preflight API on http://localhost:${PORT}`));
}
module.exports = app;

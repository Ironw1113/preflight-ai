const express = require("express");
const path = require("path");
const multer = require("multer");
const { estimate, estimateWorkflow, estimateCode, CODE_TASKS } = require("./lib/estimator");
const { extractText } = require("./lib/fileExtract");
// Approval workflow / guardrail export (lib/approvals.js, lib/signoffDoc.js,
// lib/guardrailConfig.js) are implemented and tested but not mounted here —
// paused pending a decision on how to scale the SQLite-backed persistence.
// See ROADMAP.md. Re-enabling just needs the requires + routes back.
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

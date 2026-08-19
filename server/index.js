const express = require("express");
const path = require("path");
const multer = require("multer");
const { estimate, estimateWorkflow, estimateCode, CODE_TASKS } = require("./lib/estimator");
const { extractText, extractProjectText } = require("./lib/fileExtract");
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
const uploadProject = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 500 } });
const PROJECT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;

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

// Same idea as /api/extract-text but for a whole folder/project (multipart
// field "files", repeated). Junk paths (node_modules, .git, build output,
// ...) and unsupported extensions are skipped rather than erroring the
// whole batch — see extractProjectText(). Files are processed in memory
// and never written to disk.
//
// Relative paths travel in a companion "paths" field (JSON array, same
// order as "files") rather than in each file's declared filename: the
// multipart/form-data spec (and every client we tested — curl, Node's own
// fetch/FormData) reduces a filename containing "/" to its basename, so
// "src/index.js" and "node_modules/foo/index.js" would both arrive as
// just "index.js" and be indistinguishable — the whole point of tracking
// paths (skipping node_modules/.git/build output) breaks without this.
app.post("/api/extract-project", uploadProject.array("files"), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "files are required (multipart field 'files')" });
  }
  const totalBytes = req.files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > PROJECT_MAX_TOTAL_BYTES) {
    return res.status(400).json({ error: `Total upload too large (max ${PROJECT_MAX_TOTAL_BYTES / (1024 * 1024)}MB combined)` });
  }
  let paths = [];
  try {
    paths = req.body.paths ? JSON.parse(req.body.paths) : [];
  } catch {
    return res.status(400).json({ error: "paths must be a JSON array" });
  }
  try {
    const result = await extractProjectText(
      req.files.map((f, i) => ({ buffer: f.buffer, originalName: paths[i] || f.originalname, mimetype: f.mimetype }))
    );
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

app.post("/api/estimate-code", async (req, res) => {
  try {
    const result = await estimateCode(req.body || {}, data.models, data.codingTools);
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

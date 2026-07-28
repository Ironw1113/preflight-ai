/**
 * Approval workflow — the "Approve" stage of Predict -> Approve -> Enforce -> Learn.
 * Turns a saved estimate into a budget request a manager can approve or
 * reject, with a timestamped audit trail. No accounts yet (see ROADMAP.md):
 * anyone with the app URL can create and decide requests.
 */
const crypto = require("node:crypto");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { estimate, estimateWorkflow, estimateCode } = require("./estimator");

const KINDS = ["single", "workflow", "code"];

function openDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      decidedAt TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      modelId TEXT NOT NULL,
      modelSource TEXT NOT NULL DEFAULT 'model',
      modelName TEXT NOT NULL,
      ownerName TEXT NOT NULL,
      p90Budget REAL NOT NULL,
      blowoutCap REAL NOT NULL,
      justification TEXT NOT NULL,
      decisionNote TEXT,
      params TEXT NOT NULL,
      result TEXT NOT NULL
    )
  `);
  return db;
}

let dbInstance = null;
function getDb() {
  if (!dbInstance) {
    const dbPath = process.env.PREFLIGHT_DB_PATH || path.join(__dirname, "..", "data", "preflight.db");
    dbInstance = openDb(dbPath);
  }
  return dbInstance;
}

// tests need a fresh, isolated database per run
function resetDbForTests(dbPath = ":memory:") {
  if (dbInstance) dbInstance.close();
  dbInstance = openDb(dbPath);
  return dbInstance;
}

async function runEstimate(kind, params, models, codingTools) {
  if (kind === "single") return estimate(params, models);
  if (kind === "workflow") return estimateWorkflow(params, models);
  if (kind === "code") return estimateCode(params, models, codingTools);
  throw new Error(`kind must be one of: ${KINDS.join(", ")}`);
}

function findChosen(result, modelId, modelSource) {
  const pool = modelSource === "codingTool" ? result.codingTools || [] : result.results;
  const found = pool.find((r) => r.id === modelId);
  if (!found) {
    throw new Error(`modelId "${modelId}" not found in ${modelSource === "codingTool" ? "codingTools" : "results"}`);
  }
  return found;
}

function rowToRecord(row) {
  return {
    id: row.id,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    status: row.status,
    name: row.name,
    kind: row.kind,
    modelId: row.modelId,
    modelSource: row.modelSource,
    modelName: row.modelName,
    ownerName: row.ownerName,
    p90Budget: row.p90Budget,
    blowoutCap: row.blowoutCap,
    justification: row.justification,
    decisionNote: row.decisionNote,
    params: JSON.parse(row.params),
    result: JSON.parse(row.result)
  };
}

/**
 * Save the estimate as a named scenario and create a pending budget request
 * in one step. The estimate is re-run server-side (not trusted from the
 * client) so the stored snapshot is authoritative for the audit trail and
 * for later price-churn re-forecasting (ROADMAP item 5).
 */
async function createApproval(params, models, codingTools) {
  const { name, kind, estimateParams, modelId, modelSource = "model", ownerName, p90Budget, blowoutCap, justification } = params;

  if (!name || !name.trim()) throw new Error("name is required");
  if (!KINDS.includes(kind)) throw new Error(`kind must be one of: ${KINDS.join(", ")}`);
  if (!ownerName || !ownerName.trim()) throw new Error("ownerName is required");
  if (!justification || !justification.trim()) throw new Error("business justification is required");
  if (!(p90Budget > 0)) throw new Error("p90Budget must be positive");
  if (!(blowoutCap >= p90Budget)) throw new Error("blowoutCap must be >= p90Budget");

  const result = await runEstimate(kind, estimateParams, models, codingTools);
  const chosen = findChosen(result, modelId, modelSource);

  const row = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    decidedAt: null,
    status: "pending",
    name: name.trim(),
    kind,
    modelId,
    modelSource,
    modelName: chosen.name,
    ownerName: ownerName.trim(),
    p90Budget,
    blowoutCap,
    justification: justification.trim(),
    decisionNote: null,
    params: JSON.stringify(estimateParams),
    result: JSON.stringify(result)
  };

  getDb()
    .prepare(
      `INSERT INTO approvals
       (id, createdAt, decidedAt, status, name, kind, modelId, modelSource, modelName, ownerName, p90Budget, blowoutCap, justification, decisionNote, params, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id, row.createdAt, row.decidedAt, row.status, row.name, row.kind,
      row.modelId, row.modelSource, row.modelName, row.ownerName,
      row.p90Budget, row.blowoutCap, row.justification, row.decisionNote,
      row.params, row.result
    );

  return rowToRecord(row);
}

function listApprovals() {
  // rowid tiebreak: two approvals can share the same ISO-millisecond createdAt
  const rows = getDb()
    .prepare(
      `SELECT id, createdAt, decidedAt, status, name, kind, modelName, ownerName, p90Budget, blowoutCap
       FROM approvals ORDER BY createdAt DESC, rowid DESC`
    )
    .all();
  return rows;
}

function getApproval(id) {
  const row = getDb().prepare(`SELECT * FROM approvals WHERE id = ?`).get(id);
  if (!row) throw new Error("approval not found");
  return rowToRecord(row);
}

function decideApproval(id, { status, decisionNote }) {
  if (status !== "approved" && status !== "rejected") throw new Error('status must be "approved" or "rejected"');
  const existing = getDb().prepare(`SELECT status FROM approvals WHERE id = ?`).get(id);
  if (!existing) throw new Error("approval not found");
  if (existing.status !== "pending") throw new Error(`already decided (${existing.status})`);

  getDb()
    .prepare(`UPDATE approvals SET status = ?, decidedAt = ?, decisionNote = ? WHERE id = ?`)
    .run(status, new Date().toISOString(), decisionNote || null, id);

  return getApproval(id);
}

module.exports = { createApproval, listApprovals, getApproval, decideApproval, resetDbForTests, KINDS };

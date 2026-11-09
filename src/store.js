/**
 * SQLite ledger for mandates.
 * The database file lives under data/ unless MANDATE_DB_PATH is set.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const UPDATABLE = [
  'status',
  'order_id',
  'authorization_id',
  'capture_id',
  'approve_url',
  'paypal_status',
  'deliverable',
  'worker_revised',
  'model_decision',
  'model_rationale',
  'model_score',
  'decision',
  'score',
  'rationale',
  'citations',
  'last_error'
];

let database;

function databasePath() {
  if (process.env.MANDATE_DB_PATH) return process.env.MANDATE_DB_PATH;
  return path.join(__dirname, '..', 'data', 'mandate.db');
}

function openDatabase() {
  if (database) return database;
  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  database = new Database(file);
  // DELETE avoids WAL sidecar files, which OneDrive can lock.
  database.pragma('journal_mode = DELETE');
  database.exec(`
    CREATE TABLE IF NOT EXISTS mandates (
      id TEXT PRIMARY KEY,
      brief TEXT NOT NULL,
      rules TEXT NOT NULL,
      amount TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      example_key TEXT,
      status TEXT NOT NULL,
      order_id TEXT,
      authorization_id TEXT,
      capture_id TEXT,
      approve_url TEXT,
      paypal_status TEXT,
      deliverable TEXT,
      worker_revised INTEGER NOT NULL DEFAULT 0,
      model_decision TEXT,
      model_rationale TEXT,
      model_score INTEGER,
      decision TEXT,
      score INTEGER,
      rationale TEXT,
      citations TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return database;
}

function toApi(row) {
  if (!row) return null;
  let citations = [];
  if (row.citations) {
    try {
      citations = JSON.parse(row.citations);
    } catch (error) {
      citations = [];
    }
  }
  return {
    id: row.id,
    brief: row.brief,
    rules: row.rules,
    amount: row.amount,
    currency: row.currency,
    exampleKey: row.example_key,
    status: row.status,
    orderId: row.order_id,
    authorizationId: row.authorization_id,
    captureId: row.capture_id,
    approveUrl: row.approve_url,
    paypalStatus: row.paypal_status,
    deliverable: row.deliverable,
    workerRevised: Boolean(row.worker_revised),
    modelDecision: row.model_decision,
    modelRationale: row.model_rationale,
    modelScore: row.model_score,
    decision: row.decision,
    score: row.score,
    rationale: row.rationale,
    citations,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createMandate(fields) {
  const db = openDatabase();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO mandates (
      id, brief, rules, amount, currency, example_key, status,
      order_id, authorization_id, capture_id, approve_url, paypal_status,
      created_at, updated_at
    ) VALUES (
      @id, @brief, @rules, @amount, @currency, @example_key, @status,
      @order_id, NULL, NULL, @approve_url, @paypal_status,
      @created_at, @updated_at
    )
  `).run({
    id: fields.id,
    brief: fields.brief,
    rules: fields.rules,
    amount: fields.amount,
    currency: 'USD',
    example_key: fields.exampleKey || null,
    status: fields.status,
    order_id: fields.orderId || null,
    approve_url: fields.approveUrl || null,
    paypal_status: fields.paypalStatus || null,
    created_at: now,
    updated_at: now
  });
  return getMandate(fields.id);
}

function getMandate(id) {
  const row = openDatabase().prepare('SELECT * FROM mandates WHERE id = ?').get(id);
  return toApi(row);
}

function listMandates() {
  const rows = openDatabase().prepare('SELECT * FROM mandates ORDER BY created_at DESC').all();
  return rows.map(toApi);
}

function updateMandate(id, patch) {
  const keys = Object.keys(patch).filter((key) => UPDATABLE.includes(key));
  if (keys.length === 0) return getMandate(id);
  const assignments = keys.map((key) => `${key} = @${key}`);
  assignments.push('updated_at = @updated_at');
  const params = { id, updated_at: new Date().toISOString() };
  for (const key of keys) {
    const value = patch[key];
    params[key] = value === undefined ? null : value;
  }
  openDatabase()
    .prepare(`UPDATE mandates SET ${assignments.join(', ')} WHERE id = @id`)
    .run(params);
  return getMandate(id);
}

module.exports = {
  createMandate,
  getMandate,
  listMandates,
  updateMandate,
  openDatabase
};

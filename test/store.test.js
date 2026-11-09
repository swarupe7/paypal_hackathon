/**
 * SQLite ledger tests use a temp file so they never touch the demo database.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mandate-'));
const dbPath = path.join(tempDir, 'test.db');
process.env.MANDATE_DB_PATH = dbPath;

const store = require('../src/store');

describe('store', () => {
  before(() => {
    store.openDatabase();
  });

  after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Windows can keep the db handle briefly. The temp folder is still disposable.
    }
  });

  it('creates and updates a mandate', () => {
    const id = crypto.randomUUID();
    const created = store.createMandate({
      id,
      brief: 'Write a short briefing with enough characters for the form.',
      rules: 'Release only when every required URL is present in the text.',
      amount: '15.00',
      exampleKey: 'pass',
      status: 'created',
      orderId: 'ORDER-1',
      approveUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1',
      paypalStatus: 'CREATED'
    });
    assert.equal(created.id, id);
    assert.equal(created.amount, '15.00');

    const updated = store.updateMandate(id, {
      status: 'held',
      authorization_id: 'AUTH-1',
      paypal_status: 'CREATED',
      deliverable: 'Done',
      citations: JSON.stringify(['https://example.com']),
      decision: 'release',
      score: 88
    });
    assert.equal(updated.status, 'held');
    assert.equal(updated.authorizationId, 'AUTH-1');
    assert.equal(updated.citations[0], 'https://example.com');
    assert.equal(updated.score, 88);

    const listed = store.listMandates();
    assert.ok(listed.some((row) => row.id === id));
  });
});

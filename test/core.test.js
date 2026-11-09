/**
 * Pure unit tests. No PayPal or model network calls.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { formatAmount } = require('../src/money');
const { assessHardRules } = require('../src/rules');
const { settlementFor } = require('../src/settlement');
const { parseVerdict } = require('../src/agents');
const { getExample, plantedDeliverable, samplePassDeliverable, sharedRules } = require('../src/examples');

describe('formatAmount', () => {
  it('formats two decimal places', () => {
    assert.equal(formatAmount('15'), '15.00');
    assert.equal(formatAmount(9.999), '10.00');
  });

  it('rejects out of range amounts', () => {
    assert.throws(() => formatAmount(0.5), /between 1.00 and 500.00/);
    assert.throws(() => formatAmount(501), /between 1.00 and 500.00/);
  });
});

describe('assessHardRules', () => {
  it('accepts the sample passing deliverable', () => {
    assert.equal(assessHardRules(sharedRules, samplePassDeliverable), null);
  });

  it('rejects the planted failure', () => {
    const problem = assessHardRules(sharedRules, plantedDeliverable);
    assert.match(problem, /placeholder/i);
  });
});

describe('settlementFor', () => {
  it('captures a clean release', () => {
    assert.deepEqual(
      settlementFor({ modelDecision: 'release', hardViolation: null }),
      { action: 'capture', decision: 'release', reason: null }
    );
  });

  it('voids a reject', () => {
    assert.deepEqual(
      settlementFor({ modelDecision: 'reject', hardViolation: null }),
      { action: 'void', decision: 'reject', reason: null }
    );
  });

  it('voids when the rule gate blocks a release', () => {
    const result = settlementFor({
      modelDecision: 'release',
      hardViolation: 'Missing URL'
    });
    assert.equal(result.action, 'void');
    assert.equal(result.decision, 'reject');
    assert.match(result.reason, /Missing URL/);
  });

  it('holds when the model decision is unusable', () => {
    const result = settlementFor({ modelDecision: 'maybe', hardViolation: null });
    assert.equal(result.action, 'hold');
  });
});

describe('parseVerdict', () => {
  it('reads JSON from a model response', () => {
    const verdict = parseVerdict('{"decision":"release","score":90,"rationale":"All rules met","citations":["https://example.com"]}');
    assert.equal(verdict.decision, 'release');
    assert.equal(verdict.score, 90);
    assert.equal(verdict.citations[0], 'https://example.com');
  });

  it('rejects unknown decisions', () => {
    assert.throws(() => parseVerdict('{"decision":"pay","score":1,"rationale":"x","citations":[]}'), /release or reject/);
  });
});

describe('examples', () => {
  it('exposes pass and fail briefs', () => {
    assert.equal(getExample('pass').key, 'pass');
    assert.ok(getExample('fail').plantedDeliverable);
  });
});

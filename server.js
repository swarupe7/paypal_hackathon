/**
 * Mandate HTTP server.
 * Creates a PayPal authorization, then captures or voids it after the verifier runs.
 */
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const store = require('./src/store');
const paypal = require('./src/paypal');
const agents = require('./src/agents');
const { formatAmount } = require('./src/money');
const { assessHardRules } = require('./src/rules');
const { settlementFor } = require('./src/settlement');
const { examples, getExample, publicExample } = require('./src/examples');

const activeRuns = new Set();

function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Static UI is the judge-facing demo. API routes stay under /api.
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/config', (req, res) => {
    // The client id is public. It only loads the PayPal button. The secret stays on the server.
    res.json({
      paypalConfigured: paypal.paypalConfigured(),
      paypalClientId: paypal.paypalConfigured() ? process.env.PAYPAL_CLIENT_ID.trim() : '',
      aiConfigured: agents.aiConfigured(),
      paypalMode: 'sandbox',
      currency: 'USD'
    });
  });

  app.get('/api/examples', (req, res) => {
    res.json({ examples: examples.map(publicExample) });
  });

  app.get('/api/mandates', (req, res) => {
    res.json({ mandates: store.listMandates() });
  });

  app.get('/api/mandates/:id', (req, res) => {
    const mandate = requireMandate(req.params.id);
    res.json({ mandate });
  });

  app.post('/api/mandates', asyncRoute(async (req, res) => {
    const example = req.body.exampleKey ? getExample(req.body.exampleKey) : null;
    if (req.body.exampleKey && !example) {
      throw httpError(400, 'Unknown example.');
    }
    const brief = String(req.body.brief || '').trim();
    const rules = String(req.body.rules || '').trim();
    if (brief.length < 20 || brief.length > 4000) {
      throw httpError(400, 'Brief must be between 20 and 4000 characters.');
    }
    if (rules.length < 20 || rules.length > 4000) {
      throw httpError(400, 'Rules must be between 20 and 4000 characters.');
    }
    const amount = formatAmount(req.body.amount);
    const id = crypto.randomUUID();

    // The order exists before the ledger row so a failed PayPal call leaves no half-open mandate.
    const order = await paypal.createOrder({ amount, mandateId: id });
    const mandate = store.createMandate({
      id,
      brief,
      rules,
      amount,
      exampleKey: example ? example.key : null,
      status: 'created',
      orderId: order.id,
      approveUrl: paypal.extractLink(order, 'approve'),
      paypalStatus: order.status || 'CREATED'
    });
    res.status(201).json({ mandate });
  }));

  app.post('/api/mandates/:id/authorize', asyncRoute(async (req, res) => {
    const mandate = requireMandate(req.params.id);
    if (mandate.status === 'held' && mandate.authorizationId) {
      res.json({ mandate });
      return;
    }
    if (mandate.status !== 'created') {
      throw httpError(409, 'This mandate is not waiting for buyer approval.');
    }
    const order = await paypal.authorizeOrder(mandate.orderId);
    const authorization = paypal.extractAuthorization(order);
    if (!authorization) {
      throw httpError(502, 'PayPal did not return an authorization. Approve the hold in the popup, then try again.');
    }
    const updated = store.updateMandate(mandate.id, {
      status: 'held',
      authorization_id: authorization.id,
      paypal_status: authorization.status || order.status,
      last_error: null
    });
    res.json({ mandate: updated });
  }));

  app.post('/api/mandates/:id/run', asyncRoute(async (req, res) => {
    const mandate = requireHeld(req.params.id);
    lockRun(mandate.id);
    try {
      const example = mandate.exampleKey ? getExample(mandate.exampleKey) : null;
      let deliverable = '';
      let workerRevised = false;

      // The fail example submits a known-bad draft so the void path does not depend on the worker.
      if (example && example.plantedDeliverable) {
        deliverable = example.plantedDeliverable;
      } else {
        const produced = await agents.produceDeliverable({
          brief: mandate.brief,
          rules: mandate.rules
        });
        deliverable = produced.deliverable;
        workerRevised = produced.revised;
      }

      store.updateMandate(mandate.id, {
        deliverable,
        worker_revised: workerRevised ? 1 : 0,
        last_error: null
      });

      const verdict = await agents.verifyDeliverable({
        rules: mandate.rules,
        deliverable
      });
      const hardViolation = assessHardRules(mandate.rules, deliverable);
      const settlement = settlementFor({
        modelDecision: verdict.decision,
        hardViolation
      });
      const updated = await applySettlement(mandate, {
        settlement,
        verdict,
        deliverable,
        workerRevised
      });
      res.json({ mandate: updated });
    } catch (error) {
      // Keep the hold and surface the failure. A later override can still capture or void.
      store.updateMandate(mandate.id, { last_error: error.message });
      throw error;
    } finally {
      activeRuns.delete(mandate.id);
    }
  }));

  app.post('/api/mandates/:id/capture', asyncRoute(async (req, res) => {
    const mandate = requireHeld(req.params.id);
    const captured = await paypal.captureAuthorization(mandate.authorizationId, mandate.amount);
    const capture = paypal.extractCapture(captured);
    const updated = store.updateMandate(mandate.id, {
      status: 'released',
      capture_id: capture ? capture.id : null,
      paypal_status: capture ? capture.status : 'COMPLETED',
      decision: mandate.decision || 'release',
      rationale: mandate.rationale || 'Captured by manual override.',
      last_error: null
    });
    res.json({ mandate: updated });
  }));

  app.post('/api/mandates/:id/void', asyncRoute(async (req, res) => {
    const mandate = requireHeld(req.params.id);
    const voided = await paypal.voidAuthorization(mandate.authorizationId);
    const updated = store.updateMandate(mandate.id, {
      status: 'voided',
      paypal_status: voided.status || 'VOIDED',
      decision: mandate.decision || 'reject',
      rationale: mandate.rationale || 'Voided by manual override.',
      last_error: null
    });
    res.json({ mandate: updated });
  }));

  app.post('/api/mandates/:id/refresh', asyncRoute(async (req, res) => {
    const mandate = requireMandate(req.params.id);
    if (!mandate.orderId) throw httpError(409, 'This mandate has no PayPal order yet.');
    const order = await paypal.getOrder(mandate.orderId);
    const authorization = paypal.extractAuthorization(order);
    const capture = paypal.extractCapture(order);
    const patch = {
      paypal_status: (capture && capture.status) || (authorization && authorization.status) || order.status,
      last_error: null
    };
    if (authorization && !mandate.authorizationId) patch.authorization_id = authorization.id;
    if (capture && !mandate.captureId) patch.capture_id = capture.id;
    if (capture && mandate.status === 'held') patch.status = 'released';
    if (authorization && authorization.status === 'VOIDED' && mandate.status !== 'released') {
      patch.status = 'voided';
    }
    if (authorization && authorization.status === 'CREATED' && mandate.status === 'created') {
      patch.status = 'held';
    }
    res.json({ mandate: store.updateMandate(mandate.id, patch) });
  }));

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const status = error.statusCode || 500;
    res.status(status).json({
      error: error.message || 'Request failed.',
      code: error.code || null
    });
  });

  return app;
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireMandate(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw httpError(400, 'Unknown mandate.');
  const mandate = store.getMandate(id);
  if (!mandate) throw httpError(404, 'Mandate not found.');
  return mandate;
}

function requireHeld(id) {
  const mandate = requireMandate(id);
  if (mandate.status !== 'held' || !mandate.authorizationId) {
    throw httpError(409, 'Funds are not held on this mandate.');
  }
  return mandate;
}

function lockRun(id) {
  if (activeRuns.has(id)) throw httpError(409, 'This mandate is already running.');
  activeRuns.add(id);
}

async function applySettlement(mandate, { settlement, verdict, deliverable, workerRevised }) {
  const base = {
    deliverable,
    worker_revised: workerRevised ? 1 : 0,
    model_decision: verdict.decision,
    model_rationale: verdict.rationale,
    model_score: verdict.score,
    citations: JSON.stringify(verdict.citations || []),
    score: verdict.score
  };

  if (settlement.action === 'hold') {
    return store.updateMandate(mandate.id, {
      ...base,
      last_error: settlement.reason
    });
  }

  const overridden = Boolean(settlement.reason) && verdict.decision === 'release';
  const rationale = overridden
    ? `${settlement.reason} The model had said release. The hold was voided instead.`
    : verdict.rationale;

  const decision = settlement.action === 'capture' ? 'release' : 'reject';
  store.updateMandate(mandate.id, {
    ...base,
    decision,
    rationale,
    last_error: null
  });

  try {
    if (settlement.action === 'capture') {
      const captured = await paypal.captureAuthorization(mandate.authorizationId, mandate.amount);
      const capture = paypal.extractCapture(captured);
      return store.updateMandate(mandate.id, {
        status: 'released',
        capture_id: capture ? capture.id : null,
        paypal_status: capture ? capture.status : 'COMPLETED',
        last_error: null
      });
    }

    const voided = await paypal.voidAuthorization(mandate.authorizationId);
    return store.updateMandate(mandate.id, {
      status: 'voided',
      paypal_status: voided.status || 'VOIDED',
      last_error: null
    });
  } catch (error) {
    store.updateMandate(mandate.id, { last_error: error.message });
    throw error;
  }
}

function printStartup(port) {
  const paypalState = paypal.paypalConfigured() ? 'configured' : 'missing';
  const aiState = agents.aiConfigured() ? 'configured' : 'missing';
  console.log(`Mandate listening on http://localhost:${port}`);
  console.log(`PayPal sandbox: ${paypalState}`);
  console.log(`Verifier model: ${aiState}`);
  if (paypalState === 'missing' || aiState === 'missing') {
    console.log('Fill .env from .env.example. Buyer login steps are in docs/PAYPAL_SETUP.md.');
  }
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8787;
  createApp().listen(port, () => printStartup(port));
}

module.exports = { createApp };

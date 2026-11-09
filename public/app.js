/**
 * Mandate demo UI.
 * The page loads config, fills an example, creates a hold, then renders PayPal's approval button.
 */
const banner = document.getElementById('banner');
const form = document.getElementById('mandate-form');
const briefInput = document.getElementById('brief');
const rulesInput = document.getElementById('rules');
const amountInput = document.getElementById('amount');
const exampleNote = document.getElementById('example-note');
const createButton = document.getElementById('create-button');
const ledgerList = document.getElementById('ledger-list');
const emptyStage = document.getElementById('empty-stage');
const mandateView = document.getElementById('mandate-view');

let config = { paypalConfigured: false, paypalClientId: '', aiConfigured: false };
let examples = [];
let mandates = [];
let selectedId = null;
let exampleKey = null;
let fillingExample = false;
let paypalSdkPromise = null;
let busy = false;
let problem = '';

const statusCopy = {
  created: 'Awaiting approval',
  held: 'Funds held',
  released: 'Released',
  voided: 'Voided'
};

document.getElementById('use-pass').addEventListener('click', () => applyExample('pass'));
document.getElementById('use-fail').addEventListener('click', () => applyExample('fail'));
briefInput.addEventListener('input', clearExampleIfEdited);
rulesInput.addEventListener('input', clearExampleIfEdited);
form.addEventListener('submit', onCreate);
document.getElementById('confirm-approval').addEventListener('click', () => authorizeSelected());
document.getElementById('run-button').addEventListener('click', () => runSelected());
document.getElementById('capture-button').addEventListener('click', () => postAction('capture'));
document.getElementById('void-button').addEventListener('click', () => postAction('void'));
document.getElementById('refresh-button').addEventListener('click', () => postAction('refresh'));

boot();

async function boot() {
  // Config decides whether PayPal and the verifier can run. Secrets stay on the server.
  const [configResponse, exampleResponse, mandateResponse] = await Promise.all([
    api('/api/config'),
    api('/api/examples'),
    api('/api/mandates')
  ]);
  config = configResponse;
  examples = exampleResponse.examples || [];
  mandates = mandateResponse.mandates || [];
  renderBanner();
  renderLedger();
  createButton.disabled = !config.paypalConfigured;
}

function renderBanner() {
  const lines = [];
  if (!config.paypalConfigured) {
    lines.push('PayPal sandbox credentials are missing. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to .env, then restart. Buyer login steps are in docs/PAYPAL_SETUP.md.');
  }
  if (!config.aiConfigured) {
    lines.push('OPENAI_API_KEY is missing. Holds, captures, and voids still work. The worker and verifier stay blocked until a key is present.');
  }
  if (problem) lines.push(problem);
  banner.hidden = lines.length === 0;
  banner.replaceChildren();
  for (const line of lines) {
    const paragraph = document.createElement('p');
    paragraph.textContent = line;
    banner.appendChild(paragraph);
  }
}

function applyExample(key) {
  const example = examples.find((item) => item.key === key);
  if (!example) return;
  fillingExample = true;
  exampleKey = key;
  briefInput.value = example.brief;
  rulesInput.value = example.rules;
  amountInput.value = example.amount;
  fillingExample = false;
  exampleNote.hidden = false;
  exampleNote.textContent = example.usesPlantedDeliverable
    ? 'Planted failure: the worker is skipped and a draft that breaks the rules is sent to the verifier.'
    : 'Passing example: the worker writes the briefing, then the verifier decides whether to capture.';
  document.getElementById('use-pass').setAttribute('aria-pressed', String(key === 'pass'));
  document.getElementById('use-fail').setAttribute('aria-pressed', String(key === 'fail'));
}

function clearExampleIfEdited() {
  if (fillingExample) return;
  exampleKey = null;
  exampleNote.hidden = true;
  document.getElementById('use-pass').setAttribute('aria-pressed', 'false');
  document.getElementById('use-fail').setAttribute('aria-pressed', 'false');
}

async function onCreate(event) {
  event.preventDefault();
  await withBusy(createButton, async () => {
    const payload = await api('/api/mandates', {
      method: 'POST',
      body: {
        brief: briefInput.value,
        rules: rulesInput.value,
        amount: amountInput.value,
        exampleKey
      }
    });
    upsertMandate(payload.mandate);
    selectMandate(payload.mandate.id);
  });
}

function renderLedger() {
  ledgerList.replaceChildren();
  if (mandates.length === 0) {
    const item = document.createElement('li');
    item.className = 'empty-copy';
    item.textContent = 'No mandates yet.';
    ledgerList.appendChild(item);
    return;
  }
  for (const mandate of mandates) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ledger-item';
    button.setAttribute('aria-current', String(mandate.id === selectedId));
    const title = document.createElement('strong');
    title.textContent = `${statusCopy[mandate.status] || mandate.status} · $${mandate.amount}`;
    const meta = document.createElement('span');
    meta.textContent = mandate.orderId || mandate.id;
    button.append(title, meta);
    button.addEventListener('click', () => selectMandate(mandate.id));
    item.appendChild(button);
    ledgerList.appendChild(item);
  }
}

function selectMandate(id) {
  selectedId = id;
  renderLedger();
  const mandate = mandates.find((item) => item.id === id);
  if (!mandate) return;
  emptyStage.hidden = true;
  mandateView.hidden = false;
  renderMandate(mandate);
}

function renderMandate(mandate) {
  const chip = document.getElementById('status-chip');
  chip.textContent = statusCopy[mandate.status] || mandate.status;
  chip.className = `chip ${mandate.status}`;
  document.getElementById('amount-label').textContent = `$${mandate.amount}`;
  renderLiveRail(mandate);
  renderIds(mandate);
  renderStageError(mandate.lastError);

  const waiting = mandate.status === 'created';
  const held = mandate.status === 'held';
  document.getElementById('approval-block').hidden = !waiting;
  document.getElementById('work-block').hidden = !held && !mandate.deliverable;
  document.getElementById('verdict-block').hidden = !mandate.modelDecision && !mandate.rationale;
  document.getElementById('override-block').hidden = !held;
  document.getElementById('run-button').hidden = !held;

  const approveLink = document.getElementById('approve-link');
  if (mandate.approveUrl) {
    approveLink.href = mandate.approveUrl;
    approveLink.hidden = false;
  } else {
    approveLink.hidden = true;
  }

  const deliverable = document.getElementById('deliverable');
  deliverable.textContent = mandate.deliverable || 'The deliverable appears after the worker or the planted draft runs.';
  const workerNote = document.getElementById('worker-note');
  if (mandate.exampleKey === 'fail') {
    workerNote.textContent = 'This example skips the worker and submits the planted draft.';
  } else if (mandate.workerRevised) {
    workerNote.textContent = 'The worker revised the draft once before the verifier saw it.';
  } else {
    workerNote.textContent = 'The worker writes from the brief. The verifier only sees the rules and the deliverable.';
  }
  document.getElementById('run-button').textContent = mandate.exampleKey === 'fail'
    ? 'Submit planted deliverable'
    : 'Run worker, then verifier';

  const summary = document.getElementById('verdict-summary');
  if (mandate.modelDecision) {
    const score = mandate.modelScore == null ? '' : ` · score ${mandate.modelScore}`;
    summary.textContent = `Model decision: ${mandate.modelDecision}${score}. Final outcome: ${mandate.decision || 'pending'}.`;
  } else {
    summary.textContent = '';
  }
  document.getElementById('rationale').textContent = mandate.rationale || mandate.modelRationale || '';
  const citations = mandate.citations || [];
  document.getElementById('citations').textContent = citations.length
    ? `Citations: ${citations.join(', ')}`
    : '';

  if (waiting) mountPayPalButton(mandate);
}

function renderIds(mandate) {
  const list = document.getElementById('paypal-ids');
  list.replaceChildren();
  const rows = [
    ['Order', mandate.orderId],
    ['Authorization', mandate.authorizationId],
    ['Capture', mandate.captureId],
    ['PayPal status', mandate.paypalStatus]
  ];
  for (const [label, value] of rows) {
    if (!value) continue;
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    list.append(term, detail);
  }
}

/**
 * Lights the stage rail so the current payment step is obvious at a glance.
 */
function renderLiveRail(mandate) {
  const rail = document.getElementById('live-rail');
  if (!rail) return;
  const markers = {
    created: mandate.status === 'created',
    held: mandate.status === 'held',
    decide: mandate.status === 'held' && Boolean(mandate.deliverable || mandate.modelDecision),
    settled: mandate.status === 'released' || mandate.status === 'voided'
  };
  const order = ['created', 'held', 'decide', 'settled'];
  let activeIndex = order.findIndex((key) => markers[key]);
  if (mandate.status === 'held' && !mandate.deliverable && !mandate.modelDecision) activeIndex = 1;
  if (mandate.status === 'released' || mandate.status === 'voided') activeIndex = 3;
  if (mandate.status === 'created') activeIndex = 0;

  for (const node of rail.querySelectorAll('[data-rail]')) {
    const key = node.getAttribute('data-rail');
    const index = order.indexOf(key);
    node.classList.toggle('active', index === activeIndex);
    node.classList.toggle('done', index < activeIndex);
  }
}

function renderStageError(message) {
  const node = document.getElementById('stage-error');
  node.hidden = !message;
  node.textContent = message || '';
}

function mountPayPalButton(mandate) {
  const host = document.getElementById('paypal-button');
  host.replaceChildren();
  if (!config.paypalConfigured || !config.paypalClientId) {
    renderStageError('PayPal sandbox credentials are missing, so the approval button cannot load.');
    return;
  }
  loadPayPalSdk().then((paypalSdk) => {
    if (!paypalSdk || selectedId !== mandate.id) return;
    const target = document.createElement('div');
    host.replaceChildren(target);
    paypalSdk.Buttons({
      // The order was created on the server with intent AUTHORIZE. The button only approves it.
      createOrder: () => mandate.orderId,
      onApprove: () => authorizeSelected(),
      onError: (error) => renderStageError(error && error.message ? error.message : 'PayPal checkout hit an error.')
    }).render(target);
  }).catch((error) => {
    renderStageError(error.message);
  });
}

function loadPayPalSdk() {
  if (window.paypal) return Promise.resolve(window.paypal);
  if (!config.paypalClientId) return Promise.resolve(null);
  if (paypalSdkPromise) return paypalSdkPromise;
  paypalSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const clientId = encodeURIComponent(config.paypalClientId);
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=authorize&disable-funding=card,credit,paylater,venmo`;
    script.onload = () => resolve(window.paypal);
    script.onerror = () => reject(new Error('The PayPal checkout script did not load.'));
    document.head.appendChild(script);
  });
  return paypalSdkPromise;
}

async function authorizeSelected() {
  await postAction('authorize');
}

async function runSelected() {
  await withBusy(document.getElementById('run-button'), async () => {
    await postAction('run');
  });
}

async function postAction(action) {
  if (!selectedId) return;
  const payload = await api(`/api/mandates/${selectedId}/${action}`, { method: 'POST', body: {} });
  upsertMandate(payload.mandate);
  selectMandate(payload.mandate.id);
}

function upsertMandate(mandate) {
  mandates = [mandate, ...mandates.filter((item) => item.id !== mandate.id)];
}

async function withBusy(button, work) {
  if (busy) return;
  busy = true;
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = 'Working...';
  try {
    await work();
  } finally {
    busy = false;
    button.disabled = !config.paypalConfigured && button === createButton;
    button.textContent = previous;
  }
}

async function api(url, options) {
  const response = await fetch(url, {
    method: options && options.method ? options.method : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options && options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || 'Request failed.';
    renderStageError(message);
    throw new Error(message);
  }
  return data;
}

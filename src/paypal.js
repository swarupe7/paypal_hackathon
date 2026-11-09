/**
 * PayPal sandbox client for Orders v2 authorize and Payments v2 capture or void.
 * Live mode is refused so a hackathon demo cannot charge a real buyer.
 */
const crypto = require('crypto');

class PayPalError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'PayPalError';
    this.statusCode = 502;
    this.paypalStatus = status;
    this.body = body;
  }
}

let tokenCache = { value: '', expiresAt: 0 };

function paypalConfigured() {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET &&
    String(process.env.PAYPAL_CLIENT_ID).trim() &&
    String(process.env.PAYPAL_CLIENT_SECRET).trim()
  );
}

function baseUrl() {
  const mode = (process.env.PAYPAL_MODE || 'sandbox').trim();
  if (mode !== 'sandbox') {
    const error = new Error('PAYPAL_MODE must be sandbox. Mandate does not call live PayPal.');
    error.statusCode = 400;
    throw error;
  }
  return 'https://api-m.sandbox.paypal.com';
}

function requireConfig() {
  if (!paypalConfigured()) {
    const error = new Error('Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to .env, then restart.');
    error.statusCode = 503;
    throw error;
  }
}

async function getAccessToken() {
  requireConfig();
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;

  // Client credentials are enough for sandbox server calls. The buyer approves in the popup.
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID.trim()}:${process.env.PAYPAL_CLIENT_SECRET.trim()}`
  ).toString('base64');
  const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: 'grant_type=client_credentials'
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw paypalError(response.status, body);
  }
  const skewMs = 60 * 1000;
  tokenCache = {
    value: body.access_token,
    expiresAt: Date.now() + (Number(body.expires_in) * 1000) - skewMs
  };
  return tokenCache.value;
}

async function paypalRequest(method, pathname, body, extraHeaders) {
  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'PayPal-Request-Id': crypto.randomUUID(),
    ...(extraHeaders || {})
  };
  const options = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl()}${pathname}`, options);
  const parsed = await readJson(response);
  if (!response.ok) {
    throw paypalError(response.status, parsed);
  }
  return parsed;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    return { message: text.slice(0, 300) };
  }
}

function paypalError(status, body) {
  const detail = Array.isArray(body.details) && body.details[0]
    ? body.details[0].description || body.details[0].issue
    : '';
  const message = detail || body.message || body.error_description || body.error || 'PayPal request failed.';
  const debug = body.debug_id ? ` debug_id ${body.debug_id}.` : '';
  return new PayPalError(`${message}${debug}`, status, body);
}

function extractLink(order, rel) {
  const links = order && order.links ? order.links : [];
  const match = links.find((link) => link.rel === rel);
  return match ? match.href : null;
}

function extractAuthorization(order) {
  const units = order && order.purchase_units ? order.purchase_units : [];
  for (const unit of units) {
    const authorizations = unit.payments && unit.payments.authorizations;
    if (authorizations && authorizations.length > 0) return authorizations[0];
  }
  return null;
}

function extractCapture(orderOrPayment) {
  if (orderOrPayment && orderOrPayment.id && orderOrPayment.status && !orderOrPayment.purchase_units) {
    // A capture response from Payments v2 is the capture resource itself.
    if (orderOrPayment.status === 'COMPLETED' || orderOrPayment.status === 'PENDING') {
      return orderOrPayment;
    }
  }
  const units = orderOrPayment && orderOrPayment.purchase_units ? orderOrPayment.purchase_units : [];
  for (const unit of units) {
    const captures = unit.payments && unit.payments.captures;
    if (captures && captures.length > 0) return captures[0];
  }
  return null;
}

async function createOrder({ amount, mandateId }) {
  const order = await paypalRequest('POST', '/v2/checkout/orders', {
    intent: 'AUTHORIZE',
    purchase_units: [
      {
        custom_id: mandateId,
        description: 'Mandate hold',
        amount: {
          currency_code: 'USD',
          value: amount
        }
      }
    ]
  });
  return order;
}

async function getOrder(orderId) {
  return paypalRequest('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

async function authorizeOrder(orderId) {
  try {
    return await paypalRequest('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {});
  } catch (error) {
    // A second click after a successful authorize should show the existing hold.
    const existing = await getOrder(orderId);
    if (extractAuthorization(existing)) return existing;
    throw error;
  }
}

async function captureAuthorization(authorizationId, amount) {
  return paypalRequest(
    'POST',
    `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
    {
      amount: { currency_code: 'USD', value: amount },
      final_capture: true
    },
    { Prefer: 'return=representation' }
  );
}

async function voidAuthorization(authorizationId) {
  return paypalRequest(
    'POST',
    `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
    {},
    { Prefer: 'return=representation' }
  );
}

module.exports = {
  PayPalError,
  paypalConfigured,
  createOrder,
  getOrder,
  authorizeOrder,
  captureAuthorization,
  voidAuthorization,
  extractLink,
  extractAuthorization,
  extractCapture
};

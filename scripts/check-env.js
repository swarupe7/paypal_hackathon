/**
 * Reports which Mandate environment variables are present.
 * Prints names only, never secret values.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const required = [
  ['PAYPAL_CLIENT_ID', 'PayPal sandbox client id'],
  ['PAYPAL_CLIENT_SECRET', 'PayPal sandbox secret'],
  ['OPENAI_API_KEY', 'Verifier and worker API key']
];

const optional = [
  ['PAYPAL_MODE', 'sandbox'],
  ['OPENAI_BASE_URL', 'https://api.openai.com/v1'],
  ['OPENAI_MODEL', 'gpt-4o-mini'],
  ['PORT', '8787']
];

const envFile = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envFile)) {
  console.log('Missing .env. Copy .env.example to .env and fill in the sandbox values.');
}

let missing = 0;
for (const [name, label] of required) {
  const present = Boolean(process.env[name] && String(process.env[name]).trim());
  console.log(`${present ? 'ok   ' : 'NEED '} ${name} — ${label}`);
  if (!present) missing += 1;
}

for (const [name, fallback] of optional) {
  const value = process.env[name] && String(process.env[name]).trim();
  console.log(`info ${name} = ${value || `(default ${fallback})`}`);
}

if (process.env.PAYPAL_MODE && process.env.PAYPAL_MODE !== 'sandbox') {
  console.log('NEED PAYPAL_MODE must stay sandbox. This app refuses live payments.');
  missing += 1;
}

console.log('');
console.log('Sandbox buyer login is not an environment variable.');
console.log('Copy it from developer.paypal.com → Testing Tools → Sandbox Accounts → Personal.');
console.log('Steps: docs/PAYPAL_SETUP.md');

process.exit(missing === 0 ? 0 : 1);

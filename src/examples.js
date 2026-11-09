/**
 * Two judge-facing examples.
 * The pass path asks the worker to write the deliverable.
 * The fail path skips the worker and submits plantedDeliverable, which breaks the rules on purpose.
 */

const sharedRules = [
  'Release payment only if the deliverable has at least four sentences,',
  'includes the exact URL https://developer.paypal.com/docs/api/orders/v2/',
  'and the exact URL https://developer.paypal.com/docs/api/payments/v2/,',
  'and does not contain the word placeholder.'
].join(' ');

const passBrief = [
  'Write a short briefing, at least four sentences, explaining that a buyer can authorize a PayPal payment,',
  'an agent can complete the work, and a verifier can capture or void that authorization.',
  'Cite both sources below by placing each full URL on its own line:',
  'https://developer.paypal.com/docs/api/orders/v2/',
  'https://developer.paypal.com/docs/api/payments/v2/'
].join(' ');

const samplePassDeliverable = [
  'A buyer approves a PayPal authorization before any money is captured.',
  'An agent then completes the work described in the mandate.',
  'A second model reads the acceptance rules and the deliverable.',
  'The app captures the authorization only after that review, and voids it when the work fails.',
  'https://developer.paypal.com/docs/api/orders/v2/',
  'https://developer.paypal.com/docs/api/payments/v2/'
].join('\n');

const plantedDeliverable = [
  'Payment was processed and the notes are attached separately.',
  'This writeup is placeholder text and does not name its sources.'
].join(' ');

const examples = [
  {
    key: 'pass',
    title: 'Work that should be paid',
    summary: 'The worker writes a briefing that cites both PayPal API pages. A passing review captures the hold.',
    amount: '15.00',
    brief: passBrief,
    rules: sharedRules,
    plantedDeliverable: null,
    sampleDeliverable: samplePassDeliverable
  },
  {
    key: 'fail',
    title: 'Planted failure',
    summary: 'The worker is skipped. A short draft contains the word placeholder and cites nothing, so the hold should be voided.',
    amount: '15.00',
    brief: 'Review the planted deliverable against the acceptance rules. Do not rewrite it.',
    rules: sharedRules,
    plantedDeliverable,
    sampleDeliverable: plantedDeliverable
  }
];

function getExample(key) {
  return examples.find((example) => example.key === key) || null;
}

function publicExample(example) {
  return {
    key: example.key,
    title: example.title,
    summary: example.summary,
    amount: example.amount,
    brief: example.brief,
    rules: example.rules,
    usesPlantedDeliverable: Boolean(example.plantedDeliverable)
  };
}

module.exports = {
  examples,
  getExample,
  publicExample,
  sharedRules,
  samplePassDeliverable,
  plantedDeliverable
};

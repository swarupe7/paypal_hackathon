/**
 * Two model calls with separate jobs.
 * The worker writes the deliverable. The verifier only sees the rules and that deliverable.
 */
const { assessHardRules } = require('./rules');

const WORKER_SYSTEM = [
  'You are the worker agent for Mandate.',
  'Write the deliverable the brief asks for.',
  'Follow the acceptance rules literally, including every required URL and sentence count.',
  'Do not decide whether anyone gets paid.',
  'Return only the deliverable text.'
].join(' ');

const VERIFIER_SYSTEM = [
  'You are the payment verifier for Mandate.',
  'You decide whether a deliverable satisfies the acceptance rules.',
  'You do not write the deliverable and you do not negotiate.',
  'Choose release only when every rule is met. If any rule fails, choose reject.',
  'Reply with one JSON object and no markdown:',
  '{"decision":"release","score":85,"rationale":"short reason","citations":["https://example.com"]}',
  'decision must be "release" or "reject".',
  'score is an integer from 0 to 100.',
  'citations is an array of URLs or short quotes found in the deliverable. Use an empty array when there are none.'
].join(' ');

function aiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim());
}

function readMessageContent(data) {
  const message = data && data.choices && data.choices[0] && data.choices[0].message;
  const content = message && message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : part.text || '')).join('');
  }
  return '';
}

async function chat(messages) {
  if (!aiConfigured()) {
    const error = new Error('Verification is blocked. Add OPENAI_API_KEY to .env and restart.');
    error.statusCode = 409;
    error.code = 'VERIFICATION_BLOCKED';
    throw error;
  }
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      messages
    }),
    signal: AbortSignal.timeout(45000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.error && body.error.message ? body.error.message : 'The model request failed.';
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }
  const text = readMessageContent(body).trim();
  if (!text) {
    const error = new Error('The model returned an empty response.');
    error.statusCode = 502;
    throw error;
  }
  return text;
}

function workerMessages(brief, rules) {
  return [
    { role: 'system', content: WORKER_SYSTEM },
    {
      role: 'user',
      content: `Brief:\n${brief}\n\nAcceptance rules you must satisfy:\n${rules}`
    }
  ];
}

async function produceDeliverable({ brief, rules }) {
  const firstMessages = workerMessages(brief, rules);
  const draft = await chat(firstMessages);
  const violation = assessHardRules(rules, draft);

  // One revision when the draft misses a fixed rule. The verifier still judges the rewrite.
  if (!violation) return { deliverable: draft, revised: false };
  const deliverable = await chat([
    ...firstMessages,
    { role: 'assistant', content: draft },
    {
      role: 'user',
      content: `The draft missed the acceptance rules: ${violation} Rewrite the full deliverable so it meets the brief and the rules. Return only the deliverable.`
    }
  ]);
  return { deliverable, revised: true };
}

function parseVerdict(text) {
  const trimmed = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end <= start) {
    const error = new Error('The verifier did not return JSON. The PayPal hold was left unchanged.');
    error.statusCode = 502;
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1));
  } catch (cause) {
    const error = new Error('The verifier returned JSON that could not be read. The PayPal hold was left unchanged.');
    error.statusCode = 502;
    throw error;
  }
  const decision = String(parsed.decision || '').toLowerCase();
  if (decision !== 'release' && decision !== 'reject') {
    const error = new Error('The verifier decision was not release or reject. The PayPal hold was left unchanged.');
    error.statusCode = 502;
    throw error;
  }
  const scoreNumber = Number(parsed.score);
  const score = Number.isFinite(scoreNumber) ? Math.max(0, Math.min(100, Math.round(scoreNumber))) : null;
  const citations = Array.isArray(parsed.citations)
    ? parsed.citations.map((item) => String(item)).filter(Boolean).slice(0, 8)
    : [];
  return {
    decision,
    score,
    rationale: String(parsed.rationale || '').slice(0, 2000),
    citations
  };
}

async function verifyDeliverable({ rules, deliverable }) {
  const text = await chat([
    { role: 'system', content: VERIFIER_SYSTEM },
    {
      role: 'user',
      content: `Acceptance rules:\n${rules}\n\nDeliverable:\n${deliverable}`
    }
  ]);
  return parseVerdict(text);
}

module.exports = {
  aiConfigured,
  produceDeliverable,
  verifyDeliverable,
  parseVerdict,
  readMessageContent
};

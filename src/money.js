/**
 * Amounts sent to PayPal are decimal strings with two places.
 * The demo stays inside a small sandbox range.
 */
function formatAmount(input) {
  const value = typeof input === 'string' ? Number(input.trim()) : Number(input);
  if (!Number.isFinite(value)) {
    const error = new Error('Amount must be a number of US dollars.');
    error.statusCode = 400;
    throw error;
  }
  const rounded = Math.round(value * 100) / 100;
  if (rounded < 1 || rounded > 500) {
    const error = new Error('Amount must be between 1.00 and 500.00 USD.');
    error.statusCode = 400;
    throw error;
  }
  return rounded.toFixed(2);
}

module.exports = { formatAmount };

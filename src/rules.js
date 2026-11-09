/**
 * Fixed checks for the demo acceptance rules.
 * A failed check can block a capture. It can never force one.
 * The verifier model still makes the release-or-reject call when these checks pass.
 */
function assessHardRules(rules, deliverable) {
  const ruleText = rules || '';
  const work = deliverable || '';
  const problems = [];

  // The planted failure uses this word. Real briefs can opt into the same ban.
  if (/does not contain the word placeholder/i.test(ruleText) && /placeholder/i.test(work)) {
    problems.push('The deliverable contains the forbidden word "placeholder".');
  }

  // URLs written into the rules are required only when the rules say "exact URL".
  if (/exact url/i.test(ruleText)) {
    const urls = ruleText.match(/https:\/\/[^\s)]+/g) || [];
    const unique = [...new Set(urls.map((url) => url.replace(/[.,]$/, '')))];
    const missing = unique.filter((url) => !work.includes(url));
    if (missing.length > 0) {
      const label = missing.length > 1 ? 'URLs' : 'URL';
      problems.push(`The deliverable is missing required ${label}: ${missing.join(', ')}.`);
    }
  }

  // Sentence count is a minimum. Extra fragments from splitting do not fail the check.
  if (/at least four sentences/i.test(ruleText)) {
    const sentences = work
      .split(/[.!?]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 20);
    if (sentences.length < 4) {
      problems.push('The deliverable has fewer than four sentences.');
    }
  }

  return problems.length > 0 ? problems.join(' ') : null;
}

module.exports = { assessHardRules };

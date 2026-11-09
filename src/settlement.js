/**
 * Turns a verifier result plus the rule gate into a PayPal action.
 * hold means leave the authorization untouched.
 * capture and void are the only money movements.
 */
function settlementFor({ modelDecision, hardViolation }) {
  if (modelDecision !== 'release' && modelDecision !== 'reject') {
    return {
      action: 'hold',
      decision: null,
      reason: 'The verifier did not return a release or reject decision. The PayPal hold is unchanged.'
    };
  }

  // The rule gate can stop a release. It cannot turn a reject into a capture.
  if (hardViolation) {
    return {
      action: 'void',
      decision: 'reject',
      reason: hardViolation
    };
  }

  if (modelDecision === 'release') {
    return {
      action: 'capture',
      decision: 'release',
      reason: null
    };
  }

  return {
    action: 'void',
    decision: 'reject',
    reason: null
  };
}

module.exports = { settlementFor };

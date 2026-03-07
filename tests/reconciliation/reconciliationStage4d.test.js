const assert = require('assert');
const { evaluateReconciliationSeverity, buildActions } = require('../../services/gateway-api/src/services/reconciliation/escalationPolicy');

function withEnv(pairs, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(pairs)) {
    previous[key] = process.env[key];
    process.env[key] = String(value);
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

withEnv({
  RECON_AUTO_CASE_ENABLED: 'true',
  RECON_FINANCIAL_INBOX_ENABLED: 'true',
  RECON_FREEZE_ENABLED: 'false'
}, () => {
  const none = evaluateReconciliationSeverity({ missingInLedger: 0, missingInBank: 0, amountMismatch: 0, totalAbsoluteAmountDelta: 0 });
  assert.equal(none.severity, 'none');

  const medium = evaluateReconciliationSeverity({ missingInLedger: 1, missingInBank: 0, amountMismatch: 0, totalAbsoluteAmountDelta: 0 });
  assert.equal(medium.severity, 'medium');
  const mediumActions = buildActions({ severity: medium.severity });
  assert.equal(mediumActions.shouldCreateCase, true);
  assert.equal(mediumActions.shouldAlert, true);
  assert.equal(mediumActions.shouldFreeze, false);

  const high = evaluateReconciliationSeverity({ missingInLedger: 0, missingInBank: 0, amountMismatch: 1, totalAbsoluteAmountDelta: 15 });
  assert.equal(high.severity, 'high');
});

withEnv({
  RECON_AUTO_CASE_ENABLED: 'true',
  RECON_FINANCIAL_INBOX_ENABLED: 'true',
  RECON_FREEZE_ENABLED: 'true',
  RECON_FREEZE_SEVERITY: 'critical',
  RECON_CRITICAL_MISMATCH_COUNT: '2'
}, () => {
  const critical = evaluateReconciliationSeverity({ missingInLedger: 0, missingInBank: 0, amountMismatch: 2, totalAbsoluteAmountDelta: 10 });
  assert.equal(critical.severity, 'critical');
  const criticalActions = buildActions({ severity: critical.severity });
  assert.equal(criticalActions.shouldFreeze, true);
});

console.log('reconciliationStage4d.test.js passed');

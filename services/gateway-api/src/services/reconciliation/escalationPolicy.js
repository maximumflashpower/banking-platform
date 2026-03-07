'use strict';

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function evaluateReconciliationSeverity(summary) {
  const totalItems = toNumber(summary?.total_items);
  const matched = toNumber(summary?.matched);
  const missingInLedger = toNumber(summary?.missing_in_ledger);
  const missingInBank = toNumber(summary?.missing_in_bank);
  const amountMismatch = toNumber(summary?.amount_mismatch);

  if (
    totalItems > 0 &&
    matched === totalItems &&
    missingInLedger === 0 &&
    missingInBank === 0 &&
    amountMismatch === 0
  ) {
    return {
      severity: 'none',
      reason: 'all_items_matched'
    };
  }

  if (amountMismatch > 0) {
    return {
      severity: 'high',
      reason: 'amount_mismatch_detected'
    };
  }

  if (missingInLedger > 0) {
    return {
      severity: 'medium',
      reason: 'missing_in_ledger_detected'
    };
  }

  if (missingInBank > 0) {
    return {
      severity: 'low',
      reason: 'missing_in_bank_detected'
    };
  }

  return {
    severity: 'low',
    reason: 'unclassified_discrepancy'
  };
}

function buildActions({ severity }) {
  if (severity === 'none') {
    return {
      priority: 'low',
      shouldCreateCase: false,
      shouldAlert: false,
      shouldFreeze: false
    };
  }

  if (severity === 'low') {
    return {
      priority: 'low',
      shouldCreateCase: false,
      shouldAlert: true,
      shouldFreeze: false
    };
  }

  if (severity === 'medium') {
    return {
      priority: 'medium',
      shouldCreateCase: true,
      shouldAlert: true,
      shouldFreeze: false
    };
  }

  if (severity === 'high') {
    return {
      priority: 'high',
      shouldCreateCase: true,
      shouldAlert: true,
      shouldFreeze: false
    };
  }

  return {
    priority: 'critical',
    shouldCreateCase: true,
    shouldAlert: true,
    shouldFreeze: true
  };
}

module.exports = {
  evaluateReconciliationSeverity,
  buildActions
};

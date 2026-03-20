'use strict';

function basicRiskScoring(input) {
  validateInput(input);

  const {
    amount,
    recent_payment_count_24h,
    is_new_counterparty,
    is_known_device,
  } = input;

  let score = 0;
  const reasons = [];

  if (amount >= 1000) {
    score += 35;
    reasons.push('high_amount');
  }

  if (recent_payment_count_24h >= 3) {
    score += 25;
    reasons.push('high_payment_frequency_24h');
  }

  if (is_new_counterparty === true) {
    score += 20;
    reasons.push('new_counterparty');
  }

  if (is_known_device === false) {
    score += 20;
    reasons.push('unknown_device');
  }

  if (score > 100) score = 100;
  if (score < 0) score = 0;

  const risk_level = getRiskLevel(score);

  return {
    score,
    reasons,
    risk_level,
  };
}

function getRiskLevel(score) {
  if (score >= 70) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function validateInput(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input: object required');
  }

  const requiredFields = [
    'amount',
    'recent_payment_count_24h',
    'is_new_counterparty',
    'is_known_device',
  ];

  for (const field of requiredFields) {
    if (!(field in input)) {
      throw new Error(`Invalid input: missing field "${field}"`);
    }
  }

  if (typeof input.amount !== 'number' || input.amount < 0) {
    throw new Error('Invalid input: amount must be a non-negative number');
  }

  if (
    !Number.isInteger(input.recent_payment_count_24h) ||
    input.recent_payment_count_24h < 0
  ) {
    throw new Error(
      'Invalid input: recent_payment_count_24h must be a non-negative integer'
    );
  }

  if (typeof input.is_new_counterparty !== 'boolean') {
    throw new Error('Invalid input: is_new_counterparty must be boolean');
  }

  if (typeof input.is_known_device !== 'boolean') {
    throw new Error('Invalid input: is_known_device must be boolean');
  }
}

module.exports = {
  basicRiskScoring,
};
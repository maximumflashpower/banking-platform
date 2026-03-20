'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { basicRiskScoring } = require('../src/core/basicRiskScoring');

test('low risk case', () => {
  const result = basicRiskScoring({
    amount: 20,
    recent_payment_count_24h: 0,
    is_new_counterparty: false,
    is_known_device: true,
  });

  assert.strictEqual(result.risk_level, 'low');
  assert.strictEqual(result.score, 0);
  assert.deepStrictEqual(result.reasons, []);
});

test('high amount triggers reason', () => {
  const result = basicRiskScoring({
    amount: 1500,
    recent_payment_count_24h: 0,
    is_new_counterparty: false,
    is_known_device: true,
  });

  assert.ok(result.reasons.includes('high_amount'));
  assert.ok(result.score >= 35);
});

test('high frequency triggers reason', () => {
  const result = basicRiskScoring({
    amount: 50,
    recent_payment_count_24h: 5,
    is_new_counterparty: false,
    is_known_device: true,
  });

  assert.ok(result.reasons.includes('high_payment_frequency_24h'));
});

test('new counterparty triggers reason', () => {
  const result = basicRiskScoring({
    amount: 50,
    recent_payment_count_24h: 0,
    is_new_counterparty: true,
    is_known_device: true,
  });

  assert.ok(result.reasons.includes('new_counterparty'));
});

test('unknown device triggers reason', () => {
  const result = basicRiskScoring({
    amount: 50,
    recent_payment_count_24h: 0,
    is_new_counterparty: false,
    is_known_device: false,
  });

  assert.ok(result.reasons.includes('unknown_device'));
});

test('combined high risk', () => {
  const result = basicRiskScoring({
    amount: 2000,
    recent_payment_count_24h: 5,
    is_new_counterparty: true,
    is_known_device: false,
  });

  assert.strictEqual(result.risk_level, 'high');
  assert.ok(result.score >= 70);
  assert.strictEqual(result.reasons.length, 4);
});

test('medium threshold lower bound (30)', () => {
  const result = basicRiskScoring({
    amount: 1000,
    recent_payment_count_24h: 0,
    is_new_counterparty: false,
    is_known_device: true,
  });

  assert.strictEqual(result.risk_level, 'medium');
});

test('high threshold lower bound (70)', () => {
  const result = basicRiskScoring({
    amount: 1000,
    recent_payment_count_24h: 3,
    is_new_counterparty: true,
    is_known_device: true,
  });

  assert.strictEqual(result.risk_level, 'high');
});

// With the current weights, no exact combination produces 29 or 69 without changing scoring.
test('classifier assigns low when score is below 30', () => {
  const result = basicRiskScoring({
    amount: 100,
    recent_payment_count_24h: 0,
    is_new_counterparty: true,
    is_known_device: true,
  });

  assert.strictEqual(result.score, 20);
  assert.strictEqual(result.risk_level, 'low');
});

test('classifier assigns medium when score is between 30 and 69', () => {
  const result = basicRiskScoring({
    amount: 1000,
    recent_payment_count_24h: 0,
    is_new_counterparty: false,
    is_known_device: false,
  });

  assert.strictEqual(result.score, 55);
  assert.strictEqual(result.risk_level, 'medium');
});

test('invalid input: missing field', () => {
  assert.throws(() => {
    basicRiskScoring({
      amount: 10,
      recent_payment_count_24h: 0,
      is_new_counterparty: true,
    });
  });
});

test('invalid input: wrong types', () => {
  assert.throws(() => {
    basicRiskScoring({
      amount: '100',
      recent_payment_count_24h: 0,
      is_new_counterparty: true,
      is_known_device: false,
    });
  });
});

test('invalid input: frequency must be integer', () => {
  assert.throws(() => {
    basicRiskScoring({
      amount: 10,
      recent_payment_count_24h: 1.5,
      is_new_counterparty: false,
      is_known_device: true,
    });
  });
});
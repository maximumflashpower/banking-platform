'use strict';

const crypto = require('crypto');

function buildExecutionIdempotencyKey(paymentIntent) {
  return `payment-intent-execute:${paymentIntent.id}`;
}

function buildExecutionRequestHash(paymentIntent) {
  const payload = JSON.stringify({
    id: paymentIntent.id,
    user_id: paymentIntent.user_id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    reference_type: paymentIntent.reference_type,
    reference_id: paymentIntent.reference_id,
    status: paymentIntent.status,
  });

  return crypto.createHash('sha256').update(payload).digest('hex');
}

module.exports = {
  buildExecutionIdempotencyKey,
  buildExecutionRequestHash,
};
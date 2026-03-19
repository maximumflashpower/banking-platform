'use strict';

const paymentIntentRepo = require('../repos/paymentIntentRepo');
const paymentExecutionRepo = require('../repos/paymentExecutionRepo');
const { assertExecutableIntent } = require('../lib/paymentIntentStateGuard');
const {
  buildExecutionIdempotencyKey,
  buildExecutionRequestHash,
} = require('../lib/paymentIntentIdempotency');

module.exports = async function executePaymentIntent(id) {
  const paymentIntentId = String(id || '').trim();

  if (!paymentIntentId) {
    const error = new Error('payment intent id is required');
    error.status = 400;
    error.code = 'PAYMENT_INTENT_ID_REQUIRED';
    throw error;
  }

  const paymentIntent = await paymentIntentRepo.findById(paymentIntentId);
  assertExecutableIntent(paymentIntent);

  const existingExecution = await paymentExecutionRepo.findByIntentId(paymentIntent.id);
  if (existingExecution) {
    return {
      payment_intent: paymentIntent,
      execution: existingExecution,
      idempotent: true,
    };
  }

  const idempotencyKey = buildExecutionIdempotencyKey(paymentIntent);
  const requestHash = buildExecutionRequestHash(paymentIntent);

  const createdExecution = await paymentExecutionRepo.createExecution({
    payment_intent_id: paymentIntent.id,
    idempotency_key: idempotencyKey,
    request_hash: requestHash,
  });

  if (!createdExecution) {
    const racedExecution = await paymentExecutionRepo.findByIntentId(paymentIntent.id);

    return {
      payment_intent: paymentIntent,
      execution: racedExecution,
      idempotent: true,
    };
  }

  return {
    payment_intent: paymentIntent,
    execution: createdExecution,
    idempotent: false,
  };
};
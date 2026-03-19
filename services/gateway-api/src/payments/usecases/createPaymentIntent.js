'use strict';

const paymentIntentRepo = require('../repos/paymentIntentRepo');

function makeError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

module.exports = async function createPaymentIntent(input) {
  const userId = String(input.user_id || '').trim();
  const amount = Number(input.amount);
  const currency = String(input.currency || '').trim().toUpperCase();
  const referenceType = String(input.reference_type || '').trim();
  const referenceId = String(input.reference_id || '').trim();

  if (!userId) {
    throw makeError(400, 'USER_ID_REQUIRED', 'user_id is required');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw makeError(400, 'INVALID_AMOUNT', 'amount must be greater than 0');
  }

  if (!currency) {
    throw makeError(400, 'CURRENCY_REQUIRED', 'currency is required');
  }

  if (!referenceType) {
    throw makeError(400, 'REFERENCE_TYPE_REQUIRED', 'reference_type is required');
  }

  if (!referenceId) {
    throw makeError(400, 'REFERENCE_ID_REQUIRED', 'reference_id is required');
  }

  const existing = await paymentIntentRepo.findByReference(referenceType, referenceId);
  if (existing) {
    return existing;
  }

  return paymentIntentRepo.insertPaymentIntent({
    id: referenceId,
    user_id: userId,
    amount: Math.trunc(amount),
    currency,
    reference_type: referenceType,
    reference_id: referenceId,
  });
};
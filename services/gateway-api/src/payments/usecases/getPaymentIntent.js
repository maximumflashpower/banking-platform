'use strict';

const paymentIntentRepo = require('../repos/paymentIntentRepo');

function makeError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

module.exports = async function getPaymentIntent(id) {
  const paymentIntentId = String(id || '').trim();

  if (!paymentIntentId) {
    throw makeError(400, 'PAYMENT_INTENT_ID_REQUIRED', 'payment intent id is required');
  }

  const paymentIntent = await paymentIntentRepo.findById(paymentIntentId);

  if (!paymentIntent) {
    throw makeError(404, 'PAYMENT_INTENT_NOT_FOUND', 'payment intent not found');
  }

  return paymentIntent;
};
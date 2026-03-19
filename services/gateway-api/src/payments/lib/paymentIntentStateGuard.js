'use strict';

function makeError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function assertExecutableIntent(paymentIntent) {
  if (!paymentIntent) {
    throw makeError(404, 'PAYMENT_INTENT_NOT_FOUND', 'payment intent not found');
  }

  if (paymentIntent.status !== 'confirmed') {
    throw makeError(
      409,
      'PAYMENT_INTENT_INVALID_STATE',
      `payment intent must be confirmed to execute, current status is ${paymentIntent.status}`
    );
  }
}

module.exports = {
  assertExecutableIntent,
};
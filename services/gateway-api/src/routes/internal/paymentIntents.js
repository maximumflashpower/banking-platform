'use strict';

const express = require('express');

const createPaymentIntent = require('../../payments/usecases/createPaymentIntent');
const getPaymentIntent = require('../../payments/usecases/getPaymentIntent');
const confirmPaymentIntent = require('../../payments/usecases/confirmPaymentIntent');
const cancelPaymentIntent = require('../../payments/usecases/cancelPaymentIntent');

const router = express.Router();

function isPaymentsReadEnabled() {
  return process.env.PAYMENT_INTENTS_ENABLED !== 'false';
}

function isPaymentsWriteEnabled() {
  return process.env.PAYMENT_INTENTS_WRITE_ENABLED !== 'false';
}

function sendError(res, error) {
  const status = error.status || 500;
  const code = error.code || 'INTERNAL_ERROR';
  const message = error.message || 'internal error';

  return res.status(status).json({
    ok: false,
    code,
    message,
  });
}

function domainDisabledResponse(res) {
  return res.status(503).json({
    ok: false,
    code: 'PAYMENTS_DOMAIN_DISABLED',
    message: 'payments domain disabled',
  });
}

router.post('/payment-intents', async (req, res) => {
  if (!isPaymentsReadEnabled() || !isPaymentsWriteEnabled()) {
    return domainDisabledResponse(res);
  }

  try {
    const paymentIntent = await createPaymentIntent(req.body || {});
    return res.status(200).json({
      ok: true,
      data: paymentIntent,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/payment-intents/:id', async (req, res) => {
  if (!isPaymentsReadEnabled()) {
    return domainDisabledResponse(res);
  }

  try {
    const paymentIntent = await getPaymentIntent(req.params.id);
    return res.status(200).json({
      ok: true,
      data: paymentIntent,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/payment-intents/:id/confirm', async (req, res) => {
  if (!isPaymentsReadEnabled() || !isPaymentsWriteEnabled()) {
    return domainDisabledResponse(res);
  }

  try {
    const paymentIntent = await confirmPaymentIntent(req.params.id);
    return res.status(200).json({
      ok: true,
      data: paymentIntent,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/payment-intents/:id/cancel', async (req, res) => {
  if (!isPaymentsReadEnabled() || !isPaymentsWriteEnabled()) {
    return domainDisabledResponse(res);
  }

  try {
    const paymentIntent = await cancelPaymentIntent(req.params.id);
    return res.status(200).json({
      ok: true,
      data: paymentIntent,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
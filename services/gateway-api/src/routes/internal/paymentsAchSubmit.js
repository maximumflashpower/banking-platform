'use strict';

const express = require('express');
const {
  submitAchPayment,
  ACH_RAIL_DISABLED_ERROR,
  PAYMENT_INTENT_NOT_FOUND_ERROR,
  INVALID_PAYMENT_STATE_ERROR,
  IDEMPOTENCY_KEY_REQUIRED_ERROR,
  PAYMENT_INTENT_ID_REQUIRED_ERROR,
} = require('../../services/payments/orchestrator');

const router = express.Router();

router.post('/rails/ach/submit', async (req, res) => {
  const idempotencyKey = req.header('Idempotency-Key');
  const correlationId = req.header('X-Correlation-Id');
  const { payment_intent_id: paymentIntentId } = req.body || {};

  try {
    const result = await submitAchPayment({
      paymentIntentId,
      idempotencyKey,
      correlationId,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.code === PAYMENT_INTENT_ID_REQUIRED_ERROR) {
      return res.status(400).json({
        ok: false,
        error: 'payment_intent_id_required',
      });
    }

    if (error.code === IDEMPOTENCY_KEY_REQUIRED_ERROR) {
      return res.status(400).json({
        ok: false,
        error: 'idempotency_key_required',
      });
    }

    if (error.code === ACH_RAIL_DISABLED_ERROR) {
      return res.status(409).json({
        ok: false,
        error: 'rail_disabled',
      });
    }

    if (error.code === PAYMENT_INTENT_NOT_FOUND_ERROR) {
      return res.status(404).json({
        ok: false,
        error: 'payment_intent_not_found',
      });
    }

    if (error.code === INVALID_PAYMENT_STATE_ERROR) {
      return res.status(409).json({
        ok: false,
        error: 'invalid_payment_state',
        details: error.details || null,
      });
    }

    console.error('[payments-ach-submit] unexpected_error', {
      message: error.message,
      stack: error.stack,
      correlationId: correlationId || null,
    });

    return res.status(500).json({
      ok: false,
      error: 'internal_error',
    });
  }
});

module.exports = router;
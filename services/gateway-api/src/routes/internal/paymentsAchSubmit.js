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
const auditService = require('../../services/audit/auditService');
const {
  buildRailDisabledResponse,
} = require('../../services/resilience/degradationResponses');

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

    const isAchRailDisabled =
      error.code === ACH_RAIL_DISABLED_ERROR ||
      error.code === 'RAIL_DISABLED' ||
      error.rail === 'ach' ||
      error.statusCode === 503;

    if (isAchRailDisabled) {
      try {
        if (auditService && typeof auditService.writeRailKillSwitchBlockedEvent === 'function') {
          await auditService.writeRailKillSwitchBlockedEvent({
            requestId: req.requestContext?.requestId || `ach-rail-disabled-${Date.now()}`,
            correlationId: correlationId || req.requestContext?.correlationId || null,
            spaceId: null,
            targetType: 'payments.ach.submit',
            targetId: paymentIntentId || null,
            rail: 'ach',
            result: 'rejected',
            routeMethod: req.method,
            routePath: req.originalUrl || req.url,
            httpStatus: 503,
            metadata: {
              payment_intent_id: paymentIntentId || null,
              error_code: error.code || null,
              error_message: error.message || null,
            },
          });
        }
      } catch (auditError) {
        console.error('[payments-ach-submit] audit_write_failed_for_rail_disabled', {
          message: auditError.message,
          stack: auditError.stack,
          correlationId: correlationId || null,
        });
      }

      return res.status(503).json(
        buildRailDisabledResponse({
          rail: 'ach',
          message:
            error.userMessage ||
            'ACH transfers are temporarily unavailable. Please retry later.',
          requestId: req.requestContext?.requestId || null,
        })
      );
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

    console.error('[payments-ach-submit] classified_error_debug', {
      code: error.code || null,
      rail: error.rail || null,
      statusCode: error.statusCode || null,
      status: error.status || null,
      message: error.message || null,
      stack: error.stack || null,
      correlationId: correlationId || null,
    });

    return res.status(500).json({
      ok: false,
      error: 'internal_error',
    });
  }
});

module.exports = router;
'use strict';

const { randomUUID } = require('crypto');
const express = require('express');

const router = express.Router();

const ALLOWED_ACTION_TYPES = new Set([
  'block_tx',
  'freeze_space'
]);

const ALLOWED_TARGET_TYPES = new Set([
  'payment_intent',
  'transaction',
  'space',
  'card'
]);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildValidationError(message, details) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'invalid_request';
  if (details) {
    error.details = details;
  }
  return error;
}

router.post('/actions/apply', async (req, res, next) => {
  try {
    const now = new Date().toISOString();

    const actionType = normalizeString(req.body?.actionType || req.body?.action_type);
    const targetType = normalizeString(req.body?.targetType || req.body?.target_type);
    const targetId = normalizeString(req.body?.targetId || req.body?.target_id);
    const reason = normalizeString(req.body?.reason);
    const requestedBy = normalizeString(req.body?.requestedBy || req.body?.requested_by);
    const correlationId = normalizeString(req.body?.correlationId || req.body?.correlation_id) || randomUUID();
    const idempotencyKey = normalizeString(req.body?.idempotencyKey || req.body?.idempotency_key);
    const caseId = normalizeString(req.body?.caseId || req.body?.case_id);
    const screeningId = normalizeString(req.body?.screeningId || req.body?.screening_id);
    const decisionId = normalizeString(req.body?.decisionId || req.body?.decision_id);
    const paymentIntentId = normalizeString(req.body?.paymentIntentId || req.body?.payment_intent_id);
    const spaceId = normalizeString(req.body?.spaceId || req.body?.space_id);
    const cardId = normalizeString(req.body?.cardId || req.body?.card_id);

    if (!ALLOWED_ACTION_TYPES.has(actionType)) {
      throw buildValidationError('actionType must be one of: block_tx, freeze_space', {
        field: 'actionType'
      });
    }

    if (!ALLOWED_TARGET_TYPES.has(targetType)) {
      throw buildValidationError('targetType must be one of: payment_intent, transaction, space, card', {
        field: 'targetType'
      });
    }

    if (!targetId) {
      throw buildValidationError('targetId is required', { field: 'targetId' });
    }

    if (!reason) {
      throw buildValidationError('reason is required', { field: 'reason' });
    }

    if (!requestedBy) {
      throw buildValidationError('requestedBy is required', { field: 'requestedBy' });
    }

    if (actionType === 'freeze_space' && targetType !== 'space') {
      throw buildValidationError('freeze_space requires targetType=space', {
        field: 'targetType'
      });
    }

    if (actionType === 'block_tx' && !['payment_intent', 'transaction', 'card'].includes(targetType)) {
      throw buildValidationError('block_tx requires targetType=payment_intent, transaction or card', {
        field: 'targetType'
      });
    }

    const actionId = randomUUID();

    const auditRecord = {
      actionId,
      correlationId,
      idempotencyKey: idempotencyKey || null,
      actionType,
      targetType,
      targetId,
      requestedBy,
      reason,
      refs: {
        caseId: caseId || null,
        screeningId: screeningId || null,
        decisionId: decisionId || null,
        paymentIntentId: paymentIntentId || null,
        spaceId: spaceId || (targetType === 'space' ? targetId : null),
        cardId: cardId || (targetType === 'card' ? targetId : null)
      },
      createdAt: now,
      regulatoryBoundary: {
        screening: 'separate',
        enforcement: 'risk_actions_apply'
      }
    };

    console.log('[gateway-api][risk-actions-apply] action accepted', JSON.stringify(auditRecord));

    return res.status(202).json({
      ok: true,
      action: {
        id: actionId,
        status: 'accepted',
        actionType,
        targetType,
        targetId,
        requestedAt: now
      },
      audit: auditRecord
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

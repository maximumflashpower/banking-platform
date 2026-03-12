'use strict';

const { randomUUID } = require('crypto');
const express = require('express');

const {
  ensureManualReviewCase,
  enqueueCaseCreatedEvent
} = require('../../repos/cases/amlRiskCasesRepo');

const router = express.Router();

const ALLOWED_ACTION_TYPES = new Set([
  'block_tx',
  'freeze_space',
  'manual_review'
]);

const ALLOWED_TARGET_TYPES = new Set([
  'payment_intent',
  'transaction',
  'space',
  'card',
  'business',
  'user'
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
    const riskScoreRaw = req.body?.riskScore ?? req.body?.risk_score ?? req.body?.score ?? null;
    const snapshot = req.body?.snapshot ?? null;

    const riskScore =
      riskScoreRaw === null || riskScoreRaw === undefined || riskScoreRaw === ''
        ? null
        : Number(riskScoreRaw);

    if (!ALLOWED_ACTION_TYPES.has(actionType)) {
      throw buildValidationError('actionType must be one of: block_tx, freeze_space, manual_review', {
        field: 'actionType'
      });
    }

    if (!ALLOWED_TARGET_TYPES.has(targetType)) {
      throw buildValidationError(
        'targetType must be one of: payment_intent, transaction, space, card, business, user',
        { field: 'targetType' }
      );
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

    if (
      actionType === 'manual_review' &&
      !['payment_intent', 'transaction', 'space', 'card', 'business', 'user'].includes(targetType)
    ) {
      throw buildValidationError(
        'manual_review requires targetType=payment_intent, transaction, space, card, business or user',
        { field: 'targetType' }
      );
    }

    if (riskScore !== null && Number.isNaN(riskScore)) {
      throw buildValidationError('riskScore must be numeric when provided', {
        field: 'riskScore'
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
        paymentIntentId: paymentIntentId || (targetType === 'payment_intent' ? targetId : null),
        spaceId: spaceId || (targetType === 'space' ? targetId : null),
        cardId: cardId || (targetType === 'card' ? targetId : null)
      },
      riskScore,
      createdAt: now,
      regulatoryBoundary: {
        screening: 'separate',
        enforcement: 'risk_actions_apply',
        amlWorkflow: actionType === 'manual_review' ? 'case_management' : 'not_started'
      }
    };

    if (actionType === 'manual_review') {
      const caseResult = await ensureManualReviewCase({
        paymentIntentId: paymentIntentId || (targetType === 'payment_intent' ? targetId : null),
        spaceId: spaceId || (targetType === 'space' ? targetId : null),
        reasonCode: reason,
        riskScore,
        actor: {
          type: 'risk_action',
          id: requestedBy
        },
        snapshot,
        targetType,
        targetId,
        metadata: {
          opened_from_action: 'manual_review',
          source_action_id: actionId,
          correlation_id: correlationId,
          decision_id: decisionId || null,
          screening_id: screeningId || null,
          requested_by: requestedBy,
          case_id_reference: caseId || null
        }
      });

      const amlCase = caseResult.row;

      if (caseResult.created) {
        await enqueueCaseCreatedEvent(amlCase);
      }

      console.log(
        '[gateway-api][risk-actions-apply] manual_review accepted',
        JSON.stringify({
          ...auditRecord,
          amlCaseId: amlCase.id
        })
      );

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
        aml_case: {
          id: amlCase.id,
          status: amlCase.status,
          severity: amlCase.severity,
          created: caseResult.created
        },
        audit: auditRecord
      });
    }

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

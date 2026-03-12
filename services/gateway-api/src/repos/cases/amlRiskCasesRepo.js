'use strict';

const crypto = require('crypto');
const caseDb = require('../../infrastructure/caseDb');

function newId() {
  return crypto.randomUUID();
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function severityFromOutcome(outcome) {
  if (outcome === 'block_tx') return 'critical';
  if (outcome === 'under_review') return 'high';
  if (outcome === 'manual_review') return 'high';
  return 'medium';
}

function buildCaseTitle({ paymentIntentId, targetType, targetId }) {
  if (paymentIntentId) {
    return `AML risk review for payment intent ${paymentIntentId}`;
  }

  return `AML manual review for ${targetType}:${targetId}`;
}

function buildCaseSummary({
  decisionOutcome,
  reasonCode,
  riskScore,
  targetType,
  targetId
}) {
  if (targetType && targetId) {
    return `Target ${targetType}:${targetId} flagged for AML review with outcome=${decisionOutcome}, reason=${reasonCode}, score=${riskScore}.`;
  }

  return `AML review triggered with outcome=${decisionOutcome}, reason=${reasonCode}, score=${riskScore}.`;
}

async function findByPaymentIntentId(paymentIntentId) {
  const normalizedPaymentIntentId = normalizeString(paymentIntentId);
  if (!normalizedPaymentIntentId) {
    return null;
  }

  const result = await caseDb.query(
    `
      SELECT *
      FROM aml_risk_cases
      WHERE payment_intent_id = $1
      LIMIT 1
    `,
    [normalizedPaymentIntentId]
  );

  return result.rows[0] || null;
}

async function findOpenManualReviewCaseByTarget({ targetType, targetId }) {
  const normalizedTargetType = normalizeString(targetType);
  const normalizedTargetId = normalizeString(targetId);

  if (!normalizedTargetType || !normalizedTargetId) {
    return null;
  }

  const result = await caseDb.query(
    `
      SELECT *
      FROM aml_risk_cases
      WHERE status IN ('open', 'in_review', 'awaiting_sar_decision', 'sar_required', 'sar_prepared')
        AND metadata->>'target_type' = $1
        AND metadata->>'target_id' = $2
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1
    `,
    [normalizedTargetType, normalizedTargetId]
  );

  return result.rows[0] || null;
}

async function createAmlRiskCase({
  paymentIntentId,
  spaceId,
  reasonCode,
  riskScore,
  decisionOutcome,
  actor,
  snapshot,
  targetType = 'payment_intent',
  targetId = null,
  metadata = {}
}) {
  const normalizedPaymentIntentId = normalizeString(paymentIntentId);
  const normalizedSpaceId = normalizeString(spaceId);
  const normalizedTargetType = normalizeString(targetType) || 'payment_intent';
  const normalizedTargetId = normalizeString(targetId) || normalizedPaymentIntentId || null;

  if (normalizedPaymentIntentId) {
    const existingByPaymentIntent = await findByPaymentIntentId(normalizedPaymentIntentId);
    if (existingByPaymentIntent) {
      return {
        row: existingByPaymentIntent,
        created: false
      };
    }
  }

  if (normalizedTargetType && normalizedTargetId) {
    const existingByTarget = await findOpenManualReviewCaseByTarget({
      targetType: normalizedTargetType,
      targetId: normalizedTargetId
    });
    if (existingByTarget) {
      return {
        row: existingByTarget,
        created: false
      };
    }
  }

  const id = newId();
  const severity = severityFromOutcome(decisionOutcome);

  const actorType = normalizeString(actor?.type) || 'system';
  const actorId = normalizeString(actor?.id) || 'risk-actions-apply';

  const mergedMetadata = {
    target_type: normalizedTargetType,
    target_id: normalizedTargetId,
    payment_intent_snapshot: snapshot || null,
    ...metadata
  };

  const result = await caseDb.query(
    `
      INSERT INTO aml_risk_cases (
        id,
        payment_intent_id,
        space_id,
        status,
        severity,
        title,
        summary,
        reason_code,
        risk_score,
        decision_outcome,
        created_by,
        metadata
      )
      VALUES (
        $1,
        $2,
        $3,
        'open',
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11::jsonb
      )
      RETURNING *
    `,
    [
      id,
      normalizedPaymentIntentId || null,
      normalizedSpaceId || null,
      severity,
      buildCaseTitle({
        paymentIntentId: normalizedPaymentIntentId,
        targetType: normalizedTargetType,
        targetId: normalizedTargetId
      }),
      buildCaseSummary({
        decisionOutcome,
        reasonCode,
        riskScore,
        targetType: normalizedTargetType,
        targetId: normalizedTargetId
      }),
      reasonCode,
      riskScore ?? null,
      decisionOutcome,
      `${actorType}:${actorId}`,
      JSON.stringify(mergedMetadata)
    ]
  );

  return {
    row: result.rows[0],
    created: true
  };
}

async function ensureManualReviewCase({
  paymentIntentId,
  spaceId,
  reasonCode,
  riskScore,
  actor,
  snapshot,
  targetType,
  targetId,
  metadata = {}
}) {
  return createAmlRiskCase({
    paymentIntentId,
    spaceId,
    reasonCode,
    riskScore,
    decisionOutcome: 'manual_review',
    actor,
    snapshot,
    targetType,
    targetId,
    metadata
  });
}

async function enqueueCaseCreatedEvent(caseRow) {
  const eventId = newId();

  await caseDb.query(
    `
      INSERT INTO ops_events_outbox (
        id,
        topic,
        aggregate_type,
        aggregate_id,
        payload
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      eventId,
      'ops.case.created.v1',
      'aml_risk_case',
      caseRow.id,
      JSON.stringify({
        event_id: eventId,
        event_type: 'ops.case.created.v1',
        occurred_at: new Date().toISOString(),
        case_id: caseRow.id,
        payment_intent_id: caseRow.payment_intent_id,
        space_id: caseRow.space_id,
        case_type: 'aml_risk',
        status: caseRow.status,
        severity: caseRow.severity,
        reason_code: caseRow.reason_code,
        risk_score: caseRow.risk_score,
        metadata: caseRow.metadata || {}
      })
    ]
  );

  return eventId;
}

module.exports = {
  createAmlRiskCase,
  ensureManualReviewCase,
  enqueueCaseCreatedEvent,
  findByPaymentIntentId,
  findOpenManualReviewCaseByTarget
};

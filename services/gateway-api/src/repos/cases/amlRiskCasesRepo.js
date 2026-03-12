'use strict';

const crypto = require('crypto');
const caseDb = require('../../infrastructure/caseDb');

function newId() {
  return crypto.randomUUID();
}

function severityFromOutcome(outcome) {
  if (outcome === 'block_tx') return 'critical';
  if (outcome === 'under_review') return 'high';
  return 'medium';
}

async function findByPaymentIntentId(paymentIntentId) {
  const result = await caseDb.query(
    `
      SELECT *
      FROM aml_risk_cases
      WHERE payment_intent_id = $1
      LIMIT 1
    `,
    [paymentIntentId]
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
  snapshot
}) {
  const existing = await findByPaymentIntentId(paymentIntentId);
  if (existing) return existing;

  const id = newId();
  const severity = severityFromOutcome(decisionOutcome);

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
        $1, $2, $3, 'open', $4,
        $5, $6, $7, $8, $9, $10, $11::jsonb
      )
      RETURNING *
    `,
    [
      id,
      paymentIntentId,
      spaceId,
      severity,
      `AML risk review for payment intent ${paymentIntentId}`,
      `Payment intent gated by risk with outcome=${decisionOutcome}, reason=${reasonCode}, score=${riskScore}.`,
      reasonCode,
      riskScore,
      decisionOutcome,
      `${actor.type}:${actor.id}`,
      JSON.stringify({
        payment_intent_snapshot: snapshot
      })
    ]
  );

  return result.rows[0];
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
        risk_score: caseRow.risk_score
      })
    ]
  );

  return eventId;
}

module.exports = {
  createAmlRiskCase,
  enqueueCaseCreatedEvent,
  findByPaymentIntentId
};
'use strict';

const crypto = require('crypto');
const riskDb = require('../../infrastructure/riskDb');

function newUuid() {
  return crypto.randomUUID();
}

async function createPaymentIntentRiskDecision({
  paymentIntentId,
  spaceId,
  actor,
  snapshot,
  decisionOutcome,
  reasonCode,
  riskScore,
  recommendedActions
}) {
  const decisionId = newUuid();
  const now = new Date().toISOString();

  const payload = {
    decision_id: decisionId,
    payment_intent_id: paymentIntentId,
    space_id: spaceId,
    actor: {
      type: actor?.type || 'system',
      id: actor?.id || 'unknown'
    },
    snapshot,
    decision_outcome: decisionOutcome,
    reason_code: reasonCode,
    risk_score: riskScore,
    recommended_actions: recommendedActions,
    occurred_at: now
  };

  await riskDb.query(
    `
      INSERT INTO risk_audit_immutable (
        entity_type,
        entity_id,
        event_type,
        actor_type,
        actor_id,
        payload,
        created_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6::jsonb,
        $7
      )
    `,
    [
      'payment_intent',
      paymentIntentId,
      'risk.payment_intent.gated.v1',
      actor?.type || 'system',
      actor?.id || 'unknown',
      JSON.stringify(payload),
      now
    ]
  );

  return {
    decision_id: decisionId,
    decision_outcome: decisionOutcome,
    reason_code: reasonCode,
    risk_score: riskScore,
    recommended_actions: recommendedActions
  };
}

module.exports = {
  createPaymentIntentRiskDecision
};
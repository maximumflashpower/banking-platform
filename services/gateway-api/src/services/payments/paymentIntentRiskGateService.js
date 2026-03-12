'use strict';

const paymentIntentRiskGateRepo = require('../../repos/payments/paymentIntentRiskGateRepo');
const paymentIntentRiskDecisionRepo = require('../../repos/risk/paymentIntentRiskDecisionRepo');
const amlRiskCasesRepo = require('../../repos/cases/amlRiskCasesRepo');
const opsInboxNotificationsRepo = require('../../repos/ops/opsInboxNotificationsRepo');

function normalizeSnapshot(payload) {
  return {
    space_id: payload.space_id,
    payer_user_id: payload.payer_user_id || null,
    payee_user_id: payload.payee_user_id || null,
    amount_cents: Number(payload.amount_cents || 0),
    currency: payload.currency || 'USD',
    risk_context: {
      velocity_1h_count: Number(payload?.risk_context?.velocity_1h_count || 0),
      high_risk_counterparty: Boolean(payload?.risk_context?.high_risk_counterparty),
      same_day_cashout: Boolean(payload?.risk_context?.same_day_cashout),
      force_under_review: Boolean(payload?.risk_context?.force_under_review),
      force_block_tx: Boolean(payload?.risk_context?.force_block_tx)
    }
  };
}

function deriveDecision(snapshot) {
  const amount = snapshot.amount_cents;
  const velocity = snapshot.risk_context.velocity_1h_count;
  const highRiskCounterparty = snapshot.risk_context.high_risk_counterparty;
  const sameDayCashout = snapshot.risk_context.same_day_cashout;
  const forceUnderReview = snapshot.risk_context.force_under_review;
  const forceBlockTx = snapshot.risk_context.force_block_tx;

  if (forceBlockTx || amount >= 100000 || velocity >= 10) {
    return {
      decisionOutcome: 'block_tx',
      reasonCode: forceBlockTx
        ? 'MANUAL_BLOCK_OVERRIDE'
        : velocity >= 10
          ? 'AML_VELOCITY_BLOCK'
          : 'AML_AMOUNT_BLOCK',
      riskScore: 85,
      recommendedActions: ['block_tx', 'create_aml_case', 'notify_ops']
    };
  }

  if (
    forceUnderReview ||
    amount >= 25000 ||
    velocity >= 3 ||
    highRiskCounterparty ||
    sameDayCashout
  ) {
    return {
      decisionOutcome: 'under_review',
      reasonCode: forceUnderReview
        ? 'MANUAL_REVIEW_OVERRIDE'
        : highRiskCounterparty
          ? 'AML_COUNTERPARTY_REVIEW'
          : sameDayCashout
            ? 'AML_CASHOUT_REVIEW'
            : velocity >= 3
              ? 'AML_VELOCITY_REVIEW'
              : 'AML_AMOUNT_REVIEW',
      riskScore: 55,
      recommendedActions: ['manual_review', 'create_aml_case', 'notify_ops']
    };
  }

  return {
    decisionOutcome: 'allow',
    reasonCode: 'AML_CLEAR',
    riskScore: 10,
    recommendedActions: ['allow_execution']
  };
}

async function persistOutcome({
  paymentIntentId,
  snapshot,
  actor,
  existingIntent
}) {
  const derived = deriveDecision(snapshot);

  const decision = await paymentIntentRiskDecisionRepo.createPaymentIntentRiskDecision({
    paymentIntentId,
    spaceId: existingIntent.space_id,
    actor,
    snapshot,
    decisionOutcome: derived.decisionOutcome,
    reasonCode: derived.reasonCode,
    riskScore: derived.riskScore,
    recommendedActions: derived.recommendedActions
  });

  let amlRiskCase = null;
  let opsNotification = null;

  if (
    (derived.decisionOutcome === 'under_review' || derived.decisionOutcome === 'block_tx') &&
    !existingIntent.aml_risk_case_id
  ) {
    amlRiskCase = await amlRiskCasesRepo.createAmlRiskCase({
      paymentIntentId,
      spaceId: existingIntent.space_id,
      reasonCode: derived.reasonCode,
      riskScore: derived.riskScore,
      decisionOutcome: derived.decisionOutcome,
      actor,
      snapshot
    });

    await amlRiskCasesRepo.enqueueCaseCreatedEvent(amlRiskCase);
  }

  if (
    (derived.decisionOutcome === 'under_review' || derived.decisionOutcome === 'block_tx') &&
    !existingIntent.ops_notification_id
  ) {
    opsNotification = await opsInboxNotificationsRepo.createOpsInboxNotification({
      caseId: amlRiskCase ? amlRiskCase.id : existingIntent.aml_risk_case_id || null,
      paymentIntentId,
      spaceId: existingIntent.space_id,
      decisionOutcome: derived.decisionOutcome,
      reasonCode: derived.reasonCode,
      riskScore: derived.riskScore,
      snapshot
    });

    await opsInboxNotificationsRepo.enqueueOpsInboxCreatedEvent(opsNotification);
  }

  const updatedIntent = await paymentIntentRiskGateRepo.applyRiskDecision({
    intentId: paymentIntentId,
    decisionId: decision.decision_id,
    gateStatus: derived.decisionOutcome,
    reasonCode: derived.reasonCode,
    riskScore: derived.riskScore,
    snapshot,
    amlRiskCaseId: amlRiskCase ? amlRiskCase.id : null,
    opsNotificationId: opsNotification ? opsNotification.id : null
  });

  await paymentIntentRiskGateRepo.createFinancialRiskOutboxEvent({
    paymentIntentId,
    spaceId: existingIntent.space_id,
    decisionId: decision.decision_id,
    riskGateStatus: derived.decisionOutcome,
    reasonCode: derived.reasonCode,
    riskScore: derived.riskScore,
    amlRiskCaseId: updatedIntent.aml_risk_case_id,
    opsNotificationId: updatedIntent.ops_notification_id,
    snapshot
  });

  return {
    payment_intent_id: paymentIntentId,
    decision_id: decision.decision_id,
    risk_gate_status: derived.decisionOutcome,
    reason_code: derived.reasonCode,
    risk_score: derived.riskScore,
    aml_risk_case_id: updatedIntent.aml_risk_case_id,
    ops_notification_id: updatedIntent.ops_notification_id
  };
}

async function evaluateOnCreate({ paymentIntentId, payload, actor }) {
  const existingIntent = await paymentIntentRiskGateRepo.getPaymentIntentForRisk(paymentIntentId);

  if (!existingIntent) {
    const error = new Error('payment_intent_not_found');
    error.status = 404;
    throw error;
  }

  const snapshot = normalizeSnapshot({
    ...payload,
    space_id: existingIntent.space_id
  });

  return persistOutcome({
    paymentIntentId,
    snapshot,
    actor,
    existingIntent
  });
}

async function reEvaluate({ paymentIntentId, patch, actor }) {
  const existingIntent = await paymentIntentRiskGateRepo.getPaymentIntentForRisk(paymentIntentId);

  if (!existingIntent) {
    const error = new Error('payment_intent_not_found');
    error.status = 404;
    throw error;
  }

  const merged = {
    ...(existingIntent.risk_payload_snapshot || {}),
    ...(patch || {}),
    risk_context: {
      ...((existingIntent.risk_payload_snapshot || {}).risk_context || {}),
      ...((patch || {}).risk_context || {})
    },
    space_id: existingIntent.space_id,
    payer_user_id: existingIntent.payer_user_id,
    payee_user_id: existingIntent.payee_user_id,
    currency: existingIntent.currency
  };

  const snapshot = normalizeSnapshot(merged);

  return persistOutcome({
    paymentIntentId,
    snapshot,
    actor,
    existingIntent
  });
}

async function assertRiskCleared(paymentIntentId) {
  return paymentIntentRiskGateRepo.assertIntentCanExecute(paymentIntentId);
}

module.exports = {
  assertRiskCleared,
  evaluateOnCreate,
  reEvaluate
};
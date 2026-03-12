'use strict';

const crypto = require('crypto');
const caseDb = require('../../infrastructure/caseDb');

function newId() {
  return crypto.randomUUID();
}

function priorityFromOutcome(outcome) {
  if (outcome === 'block_tx') return 'critical';
  if (outcome === 'under_review') return 'high';
  return 'medium';
}

async function findByPaymentIntentId(paymentIntentId) {
  const result = await caseDb.query(
    `
      SELECT *
      FROM ops_inbox_notifications
      WHERE payment_intent_id = $1
      LIMIT 1
    `,
    [paymentIntentId]
  );

  return result.rows[0] || null;
}

async function createOpsInboxNotification({
  caseId = null,
  paymentIntentId,
  spaceId,
  decisionOutcome,
  reasonCode,
  riskScore,
  snapshot
}) {
  const existing = await findByPaymentIntentId(paymentIntentId);
  if (existing) return existing;

  const id = newId();
  const priority = priorityFromOutcome(decisionOutcome);

  const result = await caseDb.query(
    `
      INSERT INTO ops_inbox_notifications (
        id,
        case_id,
        payment_intent_id,
        space_id,
        channel,
        priority,
        status,
        subject,
        body,
        metadata
      )
      VALUES (
        $1, $2, $3, $4, 'ops_inbox', $5, 'pending_ack',
        $6, $7, $8::jsonb
      )
      RETURNING *
    `,
    [
      id,
      caseId,
      paymentIntentId,
      spaceId,
      priority,
      `[AML] Payment intent ${decisionOutcome}: ${paymentIntentId}`,
      `Payment intent ${paymentIntentId} gated with outcome=${decisionOutcome}, reason=${reasonCode}, score=${riskScore}.`,
      JSON.stringify({
        reason_code: reasonCode,
        risk_score: riskScore,
        snapshot
      })
    ]
  );

  return result.rows[0];
}

async function enqueueOpsInboxCreatedEvent(notificationRow) {
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
      'ops.fin_inbox.message_created.v1',
      'ops_inbox_notification',
      notificationRow.id,
      JSON.stringify({
        event_id: eventId,
        event_type: 'ops.fin_inbox.message_created.v1',
        occurred_at: new Date().toISOString(),
        notification_id: notificationRow.id,
        case_id: notificationRow.case_id,
        space_id: notificationRow.space_id,
        payment_intent_id: notificationRow.payment_intent_id,
        priority: notificationRow.priority,
        subject: notificationRow.subject,
        status: notificationRow.status,
        metadata: notificationRow.metadata || {}
      })
    ]
  );

  return eventId;
}

module.exports = {
  createOpsInboxNotification,
  enqueueOpsInboxCreatedEvent,
  findByPaymentIntentId
};
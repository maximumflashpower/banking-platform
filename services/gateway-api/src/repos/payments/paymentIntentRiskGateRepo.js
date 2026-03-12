'use strict';

const crypto = require('crypto');
const db = require('../../infrastructure/financialDb');

function newUuid() {
  return crypto.randomUUID();
}

const tableColumnsCache = new Map();

async function getTableColumns(tableName) {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName);
  }

  const result = await db.query(
    `
      SELECT
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName]
  );

  const columns = result.rows;
  tableColumnsCache.set(tableName, columns);
  return columns;
}

function pickColumn(columns, candidates) {
  const names = new Set(columns.map((c) => c.column_name));
  for (const candidate of candidates) {
    if (names.has(candidate)) return candidate;
  }
  return null;
}

function getColumn(columns, name) {
  return columns.find((c) => c.column_name === name) || null;
}

function isIntLike(column) {
  if (!column) return false;
  return (
    column.data_type === 'bigint' ||
    column.data_type === 'integer' ||
    column.udt_name === 'int8' ||
    column.udt_name === 'int4'
  );
}

async function getPaymentIntentForRisk(intentId) {
  const result = await db.query(
    `
      SELECT
        id,
        space_id,
        payer_user_id,
        payee_user_id,
        currency,
        amount_cents,
        idempotency_key,
        correlation_id,
        risk_gate_status,
        risk_decision_id,
        risk_reason_code,
        risk_score,
        risk_payload_snapshot,
        aml_risk_case_id,
        ops_notification_id,
        last_risk_evaluated_at
      FROM payment_intents
      WHERE id = $1
      LIMIT 1
    `,
    [intentId]
  );

  return result.rows[0] || null;
}

async function applyRiskDecision({
  intentId,
  decisionId,
  gateStatus,
  reasonCode,
  riskScore,
  snapshot,
  amlRiskCaseId = null,
  opsNotificationId = null
}) {
  const now = new Date().toISOString();

  const result = await db.query(
    `
      UPDATE payment_intents
      SET
        risk_gate_status = $2,
        risk_decision_id = $3,
        risk_reason_code = $4,
        risk_score = $5,
        risk_payload_snapshot = $6::jsonb,
        aml_risk_case_id = COALESCE($7, aml_risk_case_id),
        ops_notification_id = COALESCE($8, ops_notification_id),
        last_risk_evaluated_at = $9,
        risk_gate_blocked_at = CASE
          WHEN $2 = 'block_tx' THEN $9
          ELSE risk_gate_blocked_at
        END,
        risk_gate_reviewed_at = CASE
          WHEN $2 = 'under_review' THEN $9
          ELSE risk_gate_reviewed_at
        END
      WHERE id = $1
      RETURNING
        id,
        space_id,
        risk_gate_status,
        risk_decision_id,
        risk_reason_code,
        risk_score,
        aml_risk_case_id,
        ops_notification_id,
        last_risk_evaluated_at
    `,
    [
      intentId,
      gateStatus,
      decisionId,
      reasonCode,
      riskScore,
      JSON.stringify(snapshot),
      amlRiskCaseId,
      opsNotificationId,
      now
    ]
  );

  return result.rows[0] || null;
}

async function createFinancialRiskOutboxEvent({
  paymentIntentId,
  spaceId,
  decisionId,
  riskGateStatus,
  reasonCode,
  riskScore,
  amlRiskCaseId = null,
  opsNotificationId = null,
  snapshot
}) {
  const eventUuid = newUuid();
  const now = new Date().toISOString();

  const columns = await getTableColumns('financial_outbox');

  const idColName = pickColumn(columns, ['id']);
  const idCol = idColName ? getColumn(columns, idColName) : null;

  const spaceIdCol = pickColumn(columns, ['space_id']);
  const topicCol = pickColumn(columns, ['topic', 'event_type', 'event_name', 'routing_key']);
  const aggregateTypeCol = pickColumn(columns, ['aggregate_type', 'entity_type', 'resource_type', 'subject_type']);
  const aggregateIdCol = pickColumn(columns, ['aggregate_id', 'entity_id', 'resource_id', 'subject_id']);
  const payloadCol = pickColumn(columns, ['payload', 'metadata', 'details', 'body']);
  const createdAtCol = pickColumn(columns, ['created_at', 'occurred_at', 'enqueued_at', 'inserted_at']);
  const statusCol = pickColumn(columns, ['publish_status', 'status']);

  if (!payloadCol) {
    throw new Error('financial_outbox_missing_payload_like_column');
  }

  const payload = {
    event_id: eventUuid,
    event_type: 'fin.payment_intent.risk_gated.v1',
    occurred_at: now,
    payment_intent_id: paymentIntentId,
    space_id: spaceId,
    decision_id: decisionId,
    risk_gate_status: riskGateStatus,
    reason_code: reasonCode,
    risk_score: riskScore,
    aml_risk_case_id: amlRiskCaseId,
    ops_notification_id: opsNotificationId,
    snapshot
  };

  const insertColumns = [];
  const values = [];
  const placeholders = [];

  function push(col, value, cast = '') {
    insertColumns.push(col);
    values.push(value);
    placeholders.push(`$${values.length}${cast}`);
  }

  if (idColName && !isIntLike(idCol)) {
    push(idColName, eventUuid);
  }

  if (spaceIdCol) {
    push(spaceIdCol, spaceId);
  }

  if (topicCol) {
    push(topicCol, 'fin.payment_intent.risk_gated.v1');
  }

  if (aggregateTypeCol) {
    push(aggregateTypeCol, 'payment_intent');
  }

  if (aggregateIdCol) {
    push(aggregateIdCol, paymentIntentId);
  }

  push(payloadCol, JSON.stringify(payload), '::jsonb');

  if (statusCol) {
    push(statusCol, 'pending');
  }

  if (createdAtCol) {
    push(createdAtCol, now);
  }

  await db.query(
    `
      INSERT INTO financial_outbox (
        ${insertColumns.join(', ')}
      )
      VALUES (
        ${placeholders.join(', ')}
      )
    `,
    values
  );

  return eventUuid;
}

async function assertIntentCanExecute(intentId) {
  const row = await getPaymentIntentForRisk(intentId);

  if (!row) {
    const error = new Error('payment_intent_not_found');
    error.status = 404;
    throw error;
  }

  if (row.risk_gate_status === 'under_review') {
    const error = new Error('payment_intent_under_review');
    error.status = 409;
    throw error;
  }

  if (row.risk_gate_status === 'block_tx') {
    const error = new Error('payment_intent_blocked_by_risk');
    error.status = 409;
    throw error;
  }

  if (row.risk_gate_status !== 'allow') {
    const error = new Error('payment_intent_not_risk_cleared');
    error.status = 409;
    throw error;
  }

  return row;
}

module.exports = {
  applyRiskDecision,
  assertIntentCanExecute,
  createFinancialRiskOutboxEvent,
  getPaymentIntentForRisk
};
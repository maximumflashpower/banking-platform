'use strict';

const { randomUUID } = require('crypto');
const { pool } = require('../../infrastructure/financialDb');
const { submitAchTransfer } = require('./rails/achAdapter');
const paymentIntentRiskGateService = require('./paymentIntentRiskGateService');
const { assertRailEnabled } = require('../resilience/railSwitches');

const ACH_RAIL_DISABLED_ERROR = 'rail_disabled';
const PAYMENT_INTENT_NOT_FOUND_ERROR = 'payment_intent_not_found';
const INVALID_PAYMENT_STATE_ERROR = 'invalid_payment_state';
const IDEMPOTENCY_KEY_REQUIRED_ERROR = 'idempotency_key_required';
const PAYMENT_INTENT_ID_REQUIRED_ERROR = 'payment_intent_id_required';
const PAYMENT_INTENT_UNDER_REVIEW_ERROR = 'payment_intent_under_review';
const PAYMENT_INTENT_BLOCKED_BY_RISK_ERROR = 'payment_intent_blocked_by_risk';
const PAYMENT_INTENT_NOT_RISK_CLEARED_ERROR = 'payment_intent_not_risk_cleared';

function isAchRailEnabled() {
  try {
    assertRailEnabled('ach');
    return true;
  } catch (_error) {
    return false;
  }
}

async function getCurrentPaymentIntent(client, paymentIntentId) {
  const result = await client.query(
    `
      SELECT
        pi.id,
        pi.space_id,
        pi.payer_user_id,
        pi.payee_user_id,
        pi.currency,
        pi.amount_cents,
        pi.idempotency_key,
        pi.correlation_id,
        pi.created_at,
        pi.updated_at,
        pi.risk_gate_status,
        latest_state.state,
        latest_state.reason_code,
        latest_state.reason_detail,
        latest_state.created_at AS state_created_at
      FROM payment_intents pi
      JOIN LATERAL (
        SELECT
          pis.state,
          pis.reason_code,
          pis.reason_detail,
          pis.created_at
        FROM payment_intent_states pis
        WHERE pis.payment_intent_id = pi.id
        ORDER BY pis.created_at DESC
        LIMIT 1
      ) latest_state ON TRUE
      WHERE pi.id = $1
      LIMIT 1
    `,
    [paymentIntentId]
  );

  return result.rows[0] || null;
}

async function getExistingTransferByIdempotency(client, paymentIntentId, idempotencyKey) {
  const result = await client.query(
    `
      SELECT
        id,
        payment_intent_id,
        provider,
        provider_transfer_id,
        amount,
        currency,
        state,
        idempotency_key,
        metadata,
        created_at,
        updated_at
      FROM rails_transfers_ach
      WHERE payment_intent_id = $1
        AND idempotency_key = $2
      LIMIT 1
    `,
    [paymentIntentId, idempotencyKey]
  );

  return result.rows[0] || null;
}

async function createTransferRecord(client, paymentIntent, idempotencyKey, correlationId) {
  const amount = Number(paymentIntent.amount_cents) / 100;

  const result = await client.query(
    `
      INSERT INTO rails_transfers_ach (
        payment_intent_id,
        provider,
        provider_transfer_id,
        amount,
        currency,
        state,
        idempotency_key,
        metadata
      )
      VALUES (
        $1,
        $2,
        null,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb
      )
      RETURNING
        id,
        payment_intent_id,
        provider,
        provider_transfer_id,
        amount,
        currency,
        state,
        idempotency_key,
        metadata,
        created_at,
        updated_at
    `,
    [
      paymentIntent.id,
      'mock_ach',
      amount.toFixed(2),
      paymentIntent.currency,
      'queued',
      idempotencyKey,
      JSON.stringify({
        correlation_id: correlationId || paymentIntent.correlation_id || null,
        rail: 'ach',
        stage: '8D',
        amount_cents: paymentIntent.amount_cents,
      }),
    ]
  );

  return result.rows[0];
}

async function markTransferSubmitted(client, transferId, adapterResponse) {
  const result = await client.query(
    `
      UPDATE rails_transfers_ach
      SET
        provider = $2,
        provider_transfer_id = $3,
        state = $4,
        metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        payment_intent_id,
        provider,
        provider_transfer_id,
        amount,
        currency,
        state,
        idempotency_key,
        metadata,
        created_at,
        updated_at
    `,
    [
      transferId,
      adapterResponse.provider,
      adapterResponse.provider_transfer_id,
      adapterResponse.state,
      JSON.stringify(adapterResponse.metadata || {}),
    ]
  );

  return result.rows[0];
}

async function insertPaymentIntentState(client, paymentIntentId, nextState, correlationId) {
  const result = await client.query(
    `
      INSERT INTO payment_intent_states (
        id,
        payment_intent_id,
        state,
        reason_code,
        reason_detail,
        correlation_id
      )
      VALUES ($1, $2, $3, null, null, $4)
      RETURNING id, payment_intent_id, state, created_at
    `,
    [randomUUID(), paymentIntentId, nextState, correlationId || 'ach_submit']
  );

  return result.rows[0];
}

function throwRiskClearanceError(statusValue) {
  if (statusValue === 'under_review') {
    const error = new Error(PAYMENT_INTENT_UNDER_REVIEW_ERROR);
    error.code = PAYMENT_INTENT_UNDER_REVIEW_ERROR;
    error.status = 409;
    throw error;
  }

  if (statusValue === 'block_tx') {
    const error = new Error(PAYMENT_INTENT_BLOCKED_BY_RISK_ERROR);
    error.code = PAYMENT_INTENT_BLOCKED_BY_RISK_ERROR;
    error.status = 409;
    throw error;
  }

  if (statusValue !== 'allow') {
    const error = new Error(PAYMENT_INTENT_NOT_RISK_CLEARED_ERROR);
    error.code = PAYMENT_INTENT_NOT_RISK_CLEARED_ERROR;
    error.status = 409;
    throw error;
  }
}

async function submitAchPayment({ paymentIntentId, idempotencyKey, correlationId }) {
  if (!paymentIntentId) {
    const error = new Error(PAYMENT_INTENT_ID_REQUIRED_ERROR);
    error.code = PAYMENT_INTENT_ID_REQUIRED_ERROR;
    error.status = 400;
    throw error;
  }

  if (!idempotencyKey) {
    const error = new Error(IDEMPOTENCY_KEY_REQUIRED_ERROR);
    error.code = IDEMPOTENCY_KEY_REQUIRED_ERROR;
    error.status = 400;
    throw error;
  }

  try {
    assertRailEnabled('ach');
  } catch (error) {
    error.code = error.code || ACH_RAIL_DISABLED_ERROR;
    error.status = 503;
    error.statusCode = 503;
    error.rail = 'ach';
    error.userMessage =
      error.userMessage || 'ACH transfers are temporarily unavailable. Please retry later.';
    throw error;
  }

  await paymentIntentRiskGateService.assertRiskCleared(paymentIntentId);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const paymentIntent = await getCurrentPaymentIntent(client, paymentIntentId);

    if (!paymentIntent) {
      const error = new Error(PAYMENT_INTENT_NOT_FOUND_ERROR);
      error.code = PAYMENT_INTENT_NOT_FOUND_ERROR;
      error.status = 404;
      throw error;
    }

    throwRiskClearanceError(paymentIntent.risk_gate_status);

    const existingTransfer = await getExistingTransferByIdempotency(
      client,
      paymentIntentId,
      idempotencyKey
    );

    if (existingTransfer) {
      await client.query('COMMIT');
      return {
        ok: true,
        idempotent: true,
        transfer: {
          id: existingTransfer.id,
          provider: existingTransfer.provider,
          provider_transfer_id: existingTransfer.provider_transfer_id,
          state: existingTransfer.state,
        },
      };
    }

    if (paymentIntent.state !== 'queued') {
      const error = new Error(INVALID_PAYMENT_STATE_ERROR);
      error.code = INVALID_PAYMENT_STATE_ERROR;
      error.status = 409;
      error.details = {
        expected: 'queued',
        actual: paymentIntent.state,
      };
      throw error;
    }

    const queuedTransfer = await createTransferRecord(
      client,
      paymentIntent,
      idempotencyKey,
      correlationId
    );

    const adapterResponse = await submitAchTransfer({
      paymentIntent,
      transfer: queuedTransfer,
      idempotencyKey,
      correlationId,
    });

    const submittedTransfer = await markTransferSubmitted(
      client,
      queuedTransfer.id,
      adapterResponse
    );

    await insertPaymentIntentState(
      client,
      paymentIntent.id,
      'submitted',
      correlationId || paymentIntent.correlation_id
    );

    await client.query('COMMIT');

    return {
      ok: true,
      idempotent: false,
      transfer: {
        id: submittedTransfer.id,
        provider: submittedTransfer.provider,
        provider_transfer_id: submittedTransfer.provider_transfer_id,
        state: submittedTransfer.state,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  submitAchPayment,
  isAchRailEnabled,
  ACH_RAIL_DISABLED_ERROR,
  PAYMENT_INTENT_NOT_FOUND_ERROR,
  INVALID_PAYMENT_STATE_ERROR,
  IDEMPOTENCY_KEY_REQUIRED_ERROR,
  PAYMENT_INTENT_ID_REQUIRED_ERROR,
  PAYMENT_INTENT_UNDER_REVIEW_ERROR,
  PAYMENT_INTENT_BLOCKED_BY_RISK_ERROR,
  PAYMENT_INTENT_NOT_RISK_CLEARED_ERROR,
};
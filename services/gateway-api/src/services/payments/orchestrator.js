'use strict';

const { randomUUID } = require('crypto');
const { pool } = require('../../infrastructure/financialDb');
const { submitAchTransfer } = require('./rails/achAdapter');

const ACH_RAIL_DISABLED_ERROR = 'rail_disabled';
const PAYMENT_INTENT_NOT_FOUND_ERROR = 'payment_intent_not_found';
const INVALID_PAYMENT_STATE_ERROR = 'invalid_payment_state';
const IDEMPOTENCY_KEY_REQUIRED_ERROR = 'idempotency_key_required';
const PAYMENT_INTENT_ID_REQUIRED_ERROR = 'payment_intent_id_required';

function isAchRailEnabled() {
  return String(process.env.ACH_RAIL_ENABLED || 'true').toLowerCase() === 'true';
}

async function getCurrentPaymentIntent(client, paymentIntentId) {
  const result = await client.query(
    `
      select
        id,
        space_id,
        payer_user_id,
        payee_user_id,
        currency,
        amount_cents,
        idempotency_key,
        correlation_id,
        created_at,
        updated_at,
        state,
        reason_code,
        reason_detail,
        state_created_at
      from current_payment_intents
      where id = $1
      limit 1
    `,
    [paymentIntentId]
  );

  return result.rows[0] || null;
}

async function getExistingTransferByIdempotency(client, paymentIntentId, idempotencyKey) {
  const result = await client.query(
    `
      select
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
      from rails_transfers_ach
      where payment_intent_id = $1
        and idempotency_key = $2
      limit 1
    `,
    [paymentIntentId, idempotencyKey]
  );

  return result.rows[0] || null;
}

async function createTransferRecord(client, paymentIntent, idempotencyKey, correlationId) {
  const amount = Number(paymentIntent.amount_cents) / 100;

  const result = await client.query(
    `
      insert into rails_transfers_ach (
        payment_intent_id,
        provider,
        provider_transfer_id,
        amount,
        currency,
        state,
        idempotency_key,
        metadata
      )
      values (
        $1,
        $2,
        null,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb
      )
      returning
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
        stage: '4A',
        amount_cents: paymentIntent.amount_cents,
      }),
    ]
  );

  return result.rows[0];
}

async function markTransferSubmitted(client, transferId, adapterResponse) {
  const result = await client.query(
    `
      update rails_transfers_ach
      set
        provider = $2,
        provider_transfer_id = $3,
        state = $4,
        metadata = coalesce(metadata, '{}'::jsonb) || $5::jsonb,
        updated_at = now()
      where id = $1
      returning
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
      insert into payment_intent_states (
        id,
        payment_intent_id,
        state,
        reason_code,
        reason_detail,
        correlation_id
      )
      values ($1, $2, $3, null, null, $4)
      returning id, payment_intent_id, state, created_at
    `,
    [randomUUID(), paymentIntentId, nextState, correlationId || 'ach_submit']
  );

  return result.rows[0];
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

  if (!isAchRailEnabled()) {
    const error = new Error(ACH_RAIL_DISABLED_ERROR);
    error.code = ACH_RAIL_DISABLED_ERROR;
    error.status = 409;
    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query('begin');

    const paymentIntent = await getCurrentPaymentIntent(client, paymentIntentId);

    if (!paymentIntent) {
      const error = new Error(PAYMENT_INTENT_NOT_FOUND_ERROR);
      error.code = PAYMENT_INTENT_NOT_FOUND_ERROR;
      error.status = 404;
      throw error;
    }

    const existingTransfer = await getExistingTransferByIdempotency(
      client,
      paymentIntentId,
      idempotencyKey
    );

    if (existingTransfer) {
      await client.query('commit');
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

    await client.query('commit');

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
    await client.query('rollback');
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
};
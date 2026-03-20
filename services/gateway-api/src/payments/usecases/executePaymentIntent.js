'use strict';

const paymentIntentRepo = require('../repos/paymentIntentRepo');
const paymentExecutionRepo = require('../repos/paymentExecutionRepo');
const { assertExecutableIntent } = require('../lib/paymentIntentStateGuard');
const { executePaymentIntentLedger } = require('../services/paymentLedgerExecutor');
const financialDb = require('../../infrastructure/financialDb');
const {
  buildExecutionIdempotencyKey,
  buildExecutionRequestHash,
} = require('../lib/paymentIntentIdempotency');

module.exports = async function executePaymentIntent(id) {
  const paymentIntentId = String(id || '').trim();

  if (!paymentIntentId) {
    const error = new Error('payment intent id is required');
    error.status = 400;
    error.code = 'PAYMENT_INTENT_ID_REQUIRED';
    throw error;
  }

  const paymentIntent = await paymentIntentRepo.findById(paymentIntentId);
  assertExecutableIntent(paymentIntent);

  const existingExecution = await paymentExecutionRepo.findByIntentId(paymentIntent.id);

  if (existingExecution && existingExecution.ledger_transaction_id) {
    return {
      payment_intent: {
        ...paymentIntent,
        status: 'executed',
      },
      execution: existingExecution,
      idempotent: true,
    };
  }

  const idempotencyKey = buildExecutionIdempotencyKey(paymentIntent);
  const requestHash = buildExecutionRequestHash(paymentIntent);

  const client = await financialDb.connect();

  try {
    await client.query('BEGIN');

    let execution = existingExecution;

    if (!execution) {
      execution = await paymentExecutionRepo.createExecution(
        {
          payment_intent_id: paymentIntent.id,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
        },
        { client }
      );

      if (!execution) {
        execution = await paymentExecutionRepo.findByIntentId(paymentIntent.id, { client });

        if (execution && execution.ledger_transaction_id) {
          await client.query('ROLLBACK');

          return {
            payment_intent: {
              ...paymentIntent,
              status: 'executed',
            },
            execution,
            idempotent: true,
          };
        }
      }
    }

    const ledgerResult = await executePaymentIntentLedger({
      client,
      paymentIntent,
      execution,
    });

    const finalizedExecution = await paymentExecutionRepo.markExecutionExecuted(
      paymentIntent.id,
      ledgerResult.ledgerTransactionId,
      { client }
    );

    const updatedIntentResult = await client.query(
      `
        UPDATE payment_intents_core
        SET status = 'executed',
            updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          user_id,
          amount,
          currency,
          reference_type,
          reference_id,
          status,
          created_at,
          updated_at
      `,
      [paymentIntent.id]
    );

    await client.query(
      `
        INSERT INTO payment_intent_state_history (
          payment_intent_id,
          state
        )
        VALUES ($1, 'executed')
      `,
      [paymentIntent.id]
    );

    await client.query('COMMIT');

    return {
      payment_intent: updatedIntentResult.rows[0],
      execution: finalizedExecution,
      idempotent: false,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
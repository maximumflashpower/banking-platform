'use strict';

const { Pool } = require('pg');

const connectionString =
  process.env.FINANCIAL_DATABASE_URL ||
  process.env.FINANCIAL_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString });
  }
  return pool;
}

function getRunner(client) {
  return client || getPool();
}

function normalizeRow(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    payment_intent_id: row.payment_intent_id,
    idempotency_key: row.idempotency_key,
    request_hash: row.request_hash,
    execution_status: row.execution_status,
    ledger_transaction_id: row.ledger_transaction_id || null,
    ledger_error_code: row.ledger_error_code || null,
    ledger_error_message: row.ledger_error_message || null,
    ledger_executed_at: row.ledger_executed_at || null,
    created_at: row.created_at,
  };
}

async function findByIntentId(paymentIntentId, options = {}) {
  const runner = getRunner(options.client);

  const result = await runner.query(
    `
      SELECT
        id,
        payment_intent_id,
        idempotency_key,
        request_hash,
        execution_status,
        ledger_transaction_id,
        ledger_error_code,
        ledger_error_message,
        ledger_executed_at,
        created_at
      FROM payment_intent_executions
      WHERE payment_intent_id = $1
      LIMIT 1
    `,
    [paymentIntentId]
  );

  return normalizeRow(result.rows[0] || null);
}

async function createExecution(
  { payment_intent_id, idempotency_key, request_hash },
  options = {}
) {
  const runner = getRunner(options.client);

  try {
    const result = await runner.query(
      `
        INSERT INTO payment_intent_executions (
          payment_intent_id,
          idempotency_key,
          request_hash,
          execution_status
        )
        VALUES ($1, $2, $3, 'recorded')
        RETURNING
          id,
          payment_intent_id,
          idempotency_key,
          request_hash,
          execution_status,
          ledger_transaction_id,
          ledger_error_code,
          ledger_error_message,
          ledger_executed_at,
          created_at
      `,
      [payment_intent_id, idempotency_key, request_hash]
    );

    return normalizeRow(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return null;
    }
    throw error;
  }
}

async function markExecutionExecuted(paymentIntentId, ledgerTransactionId, options = {}) {
  const runner = getRunner(options.client);

  const result = await runner.query(
    `
      UPDATE payment_intent_executions
      SET execution_status = 'executed',
          ledger_transaction_id = $2,
          ledger_executed_at = NOW(),
          ledger_error_code = NULL,
          ledger_error_message = NULL
      WHERE payment_intent_id = $1
      RETURNING
        id,
        payment_intent_id,
        idempotency_key,
        request_hash,
        execution_status,
        ledger_transaction_id,
        ledger_error_code,
        ledger_error_message,
        ledger_executed_at,
        created_at
    `,
    [paymentIntentId, ledgerTransactionId]
  );

  return normalizeRow(result.rows[0] || null);
}

module.exports = {
  findByIntentId,
  createExecution,
  markExecutionExecuted,
};
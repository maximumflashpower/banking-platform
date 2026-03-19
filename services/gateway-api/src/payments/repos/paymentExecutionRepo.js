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

function normalizeRow(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    payment_intent_id: row.payment_intent_id,
    idempotency_key: row.idempotency_key,
    request_hash: row.request_hash,
    execution_status: row.execution_status,
    created_at: row.created_at,
  };
}

async function findByIntentId(paymentIntentId) {
  const result = await getPool().query(
    `
      SELECT
        id,
        payment_intent_id,
        idempotency_key,
        request_hash,
        execution_status,
        created_at
      FROM payment_intent_executions
      WHERE payment_intent_id = $1
      LIMIT 1
    `,
    [paymentIntentId]
  );

  return normalizeRow(result.rows[0] || null);
}

async function createExecution({ payment_intent_id, idempotency_key, request_hash }) {
  try {
    const result = await getPool().query(
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

module.exports = {
  findByIntentId,
  createExecution,
};
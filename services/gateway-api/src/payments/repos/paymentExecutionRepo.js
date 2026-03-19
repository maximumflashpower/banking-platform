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

async function findByIntentId(intentId) {
  const res = await getPool().query(
    `
      SELECT *
      FROM payment_intent_executions
      WHERE payment_intent_reference_id = $1
         OR payment_intent_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [intentId]
  );

  return res.rows[0] || null;
}

async function createExecution({
  payment_intent_reference_id,
  payment_intent_id,
  ledger_transaction_id,
  idempotency_key,
  request_hash,
}) {
  try {
    const res = await getPool().query(
      `
        INSERT INTO payment_intent_executions (
          payment_intent_reference_id,
          payment_intent_id,
          ledger_transaction_id,
          idempotency_key,
          request_hash
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [
        payment_intent_reference_id,
        payment_intent_id,
        ledger_transaction_id,
        idempotency_key,
        request_hash,
      ]
    );

    return res.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      return null;
    }
    throw err;
  }
}

module.exports = {
  findByIntentId,
  createExecution,
};

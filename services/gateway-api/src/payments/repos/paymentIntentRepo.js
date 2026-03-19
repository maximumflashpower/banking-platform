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

function makeError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    amount: Number(row.amount),
    currency: String(row.currency || '').trim(),
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function withClient(fn) {
  if (!connectionString) {
    throw makeError(503, 'PAYMENTS_DOMAIN_UNAVAILABLE', 'payments domain unavailable');
  }

  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function findById(id) {
  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          id,
          user_id,
          amount,
          currency,
          reference_type,
          reference_id,
          status,
          created_at,
          updated_at
        FROM payment_intents_core
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    return normalizeRow(result.rows[0] || null);
  });
}

async function findByReference(referenceType, referenceId) {
  return withClient(async (client) => {
    const result = await client.query(
      `
        SELECT
          id,
          user_id,
          amount,
          currency,
          reference_type,
          reference_id,
          status,
          created_at,
          updated_at
        FROM payment_intents_core
        WHERE reference_type = $1
          AND reference_id = $2
        LIMIT 1
      `,
      [referenceType, referenceId]
    );

    return normalizeRow(result.rows[0] || null);
  });
}

async function insertPaymentIntent(input) {
  return withClient(async (client) => {
    await client.query('BEGIN');

    try {
      const insertResult = await client.query(
        `
          INSERT INTO payment_intents_core (
            id,
            user_id,
            amount,
            currency,
            reference_type,
            reference_id,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'created')
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
        [
          input.id,
          input.user_id,
          input.amount,
          input.currency,
          input.reference_type,
          input.reference_id,
        ]
      );

      await client.query(
        `
          INSERT INTO payment_intent_state_history (
            payment_intent_id,
            state
          )
          VALUES ($1, 'created')
        `,
        [input.id]
      );

      await client.query('COMMIT');
      return normalizeRow(insertResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

async function updateState(id, nextState) {
  return withClient(async (client) => {
    await client.query('BEGIN');

    try {
      const currentResult = await client.query(
        `
          SELECT
            id,
            user_id,
            amount,
            currency,
            reference_type,
            reference_id,
            status,
            created_at,
            updated_at
          FROM payment_intents_core
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (currentResult.rowCount === 0) {
        throw makeError(404, 'PAYMENT_INTENT_NOT_FOUND', 'payment intent not found');
      }

      const current = normalizeRow(currentResult.rows[0]);

      if (current.status === nextState) {
        await client.query('COMMIT');
        return current;
      }

      if (current.status !== 'created') {
        throw makeError(
          409,
          'PAYMENT_INTENT_INVALID_STATE',
          `cannot transition payment intent from ${current.status} to ${nextState}`
        );
      }

      const updateResult = await client.query(
        `
          UPDATE payment_intents_core
          SET status = $2
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
        [id, nextState]
      );

      await client.query(
        `
          INSERT INTO payment_intent_state_history (
            payment_intent_id,
            state
          )
          VALUES ($1, $2)
        `,
        [id, nextState]
      );

      await client.query('COMMIT');
      return normalizeRow(updateResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

module.exports = {
  findById,
  findByReference,
  insertPaymentIntent,
  updateState,
};
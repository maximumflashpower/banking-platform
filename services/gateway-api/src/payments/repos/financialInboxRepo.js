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
    event_type: row.event_type,
    reference_type: row.reference_type,
    reference_id: row.reference_id,
    payload: row.payload,
    created_at: row.created_at,
  };
}

async function insertEvent(
  { event_type, reference_type, reference_id, payload },
  options = {}
) {
  const runner = getRunner(options.client);

  const result = await runner.query(
    `
      INSERT INTO financial_inbox_events (
        event_type,
        reference_type,
        reference_id,
        payload
      )
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING
        id,
        event_type,
        reference_type,
        reference_id,
        payload,
        created_at
    `,
    [
      event_type,
      reference_type,
      reference_id,
      JSON.stringify(payload),
    ]
  );

  return normalizeRow(result.rows[0]);
}

module.exports = {
  insertEvent,
};
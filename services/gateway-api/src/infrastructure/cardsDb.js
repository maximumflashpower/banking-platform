'use strict';

const { Pool } = require('pg');

const connectionString =
  process.env.CARDS_DATABASE_URL ||
  process.env.CARDS_DB_URL ||
  null;

if (!connectionString) {
  console.warn('[cardsDb] CARDS_DATABASE_URL not set; cards endpoints will return 503');
}

const pool = connectionString
  ? new Pool({ connectionString })
  : null;

async function query(text, params = []) {
  if (!pool) {
    const error = new Error('cards domain unavailable');
    error.code = 'CARDS_DB_UNAVAILABLE';
    throw error;
  }

  return pool.query(text, params);
}

async function withTransaction(fn) {
  if (!pool) {
    const error = new Error('cards domain unavailable');
    error.code = 'CARDS_DB_UNAVAILABLE';
    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
};
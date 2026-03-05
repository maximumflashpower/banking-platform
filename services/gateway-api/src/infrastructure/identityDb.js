'use strict';

const { Pool } = require('pg');

const connectionString = process.env.IDENTITY_DATABASE_URL;

if (!connectionString) {
  throw new Error('IDENTITY_DATABASE_URL is required for gateway-api (identity DB)');
}

const pool = new Pool({ connectionString });

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
'use strict';

const { Pool } = require('pg');

const url = process.env.CASE_DATABASE_URL;
if (!url) throw new Error('CASE_DATABASE_URL is required');

const pool = new Pool({ connectionString: url });

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

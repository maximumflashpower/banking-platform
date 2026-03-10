'use strict';

const { Pool } = require('pg');

const connectionString =
  process.env.FINANCIAL_DATABASE_URL ||
  process.env.FINANCIAL_DB_URL ||
  null;

if (!connectionString) {
  throw new Error('FINANCIAL_DATABASE_URL is required for gateway-api (financial DB)');
}

const pool = new Pool({
  connectionString,
  max: process.env.DB_POOL_SIZE ? Number(process.env.DB_POOL_SIZE) : 10,
  idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT ? Number(process.env.DB_IDLE_TIMEOUT) : 30000,
  connectionTimeoutMillis: process.env.DB_CONNECT_TIMEOUT ? Number(process.env.DB_CONNECT_TIMEOUT) : 2000,
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function connect() {
  return pool.connect();
}

async function withTransaction(fn) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function close() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  connect,
  withTransaction,
  close,
};
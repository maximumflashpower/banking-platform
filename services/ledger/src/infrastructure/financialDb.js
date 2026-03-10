'use strict';

const { Pool } = require('pg');

const connectionString = process.env.FINANCIAL_DATABASE_URL;

if (!connectionString) {
  throw new Error('FINANCIAL_DATABASE_URL is required');
}

const pool = new Pool({
  connectionString,

  max: process.env.DB_POOL_SIZE
    ? Number(process.env.DB_POOL_SIZE)
    : 10,

  idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT
    ? Number(process.env.DB_IDLE_TIMEOUT)
    : 30000,

  connectionTimeoutMillis: process.env.DB_CONNECT_TIMEOUT
    ? Number(process.env.DB_CONNECT_TIMEOUT)
    : 2000,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function connect() {
  return pool.connect();
}

async function close() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  connect,
  close,
};
'use strict';

const { Pool } = require('pg');

let pool = null;

function resolveConnectionString() {
  return (
    process.env.SOCIAL_DB_URL ||
    process.env.SOCIAL_DATABASE_URL ||
    process.env.SOCIAL_DB_CONNECTION_STRING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    null
  );
}

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = resolveConnectionString();

  if (!connectionString) {
    const err = new Error(
      'social_db_connection_string_missing: set SOCIAL_DB_URL, SOCIAL_DATABASE_URL, SOCIAL_DB_CONNECTION_STRING, DATABASE_URL, or POSTGRES_URL'
    );
    err.code = 'social_db_connection_string_missing';
    throw err;
  }

  pool = new Pool({ connectionString });

  pool.on('error', (err) => {
    console.error('social_db_pool_error', {
      message: err?.message || String(err),
    });
  });

  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function connect() {
  return getPool().connect();
}

async function end() {
  if (!pool) {
    return;
  }

  const currentPool = pool;
  pool = null;
  await currentPool.end();
}

module.exports = {
  query,
  connect,
  end,
  getPool,
};
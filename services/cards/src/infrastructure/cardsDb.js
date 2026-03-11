'use strict';

require('dotenv').config();
const { Pool } = require('pg');

let pool;

function resolveConnectionString() {
  const connectionString =
    process.env.CARDS_DB_URL ||
    process.env.CARDS_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'cards_db_connection_string_missing: set CARDS_DB_URL or CARDS_DATABASE_URL'
    );
  }

  return connectionString;
}

function getCardsDbPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveConnectionString(),
      max: Number(process.env.CARDS_DB_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.CARDS_DB_IDLE_TIMEOUT_MS || 30000)
    });
  }

  return pool;
}

async function connect() {
  return getCardsDbPool().connect();
}

async function withCardsDbTransaction(fn) {
  const client = await connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getCardsDbPool,
  connect,
  withCardsDbTransaction
};
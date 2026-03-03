"use strict";

const { Pool } = require("pg");

const FIN_URL = process.env.FINANCIAL_DATABASE_URL;
if (!FIN_URL) {
  throw new Error("FINANCIAL_DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: FIN_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function ping() {
  const r = await pool.query("SELECT 1 AS ok");
  return r.rows?.[0]?.ok === 1;
}

module.exports = { pool, withTx, ping };
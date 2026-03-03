"use strict";

const { Pool } = require("pg");

const IDENTITY_DATABASE_URL = process.env.IDENTITY_DATABASE_URL;
if (!IDENTITY_DATABASE_URL) {
  throw new Error("IDENTITY_DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: IDENTITY_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

async function queryIdentity(text, params) {
  return pool.query(text, params);
}

async function closeIdentityPool() {
  await pool.end();
}

module.exports = { queryIdentity, closeIdentityPool };
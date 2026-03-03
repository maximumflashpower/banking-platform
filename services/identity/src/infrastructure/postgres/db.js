"use strict";

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.IDENTITY_DATABASE_URL,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function checkDb() {
  await pool.query("select 1 as ok");
  return true;
}

module.exports = { pool, query, checkDb };

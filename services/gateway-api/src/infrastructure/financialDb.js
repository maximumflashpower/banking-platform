'use strict';

const { Pool } = require('pg');

const url = process.env.FINANCIAL_DATABASE_URL;
if (!url) throw new Error('FINANCIAL_DATABASE_URL is required');

const pool = new Pool({ connectionString: url });

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { query };

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.FIN_DB_HOST || '127.0.0.1',
  port: Number(process.env.FIN_DB_PORT || 5433),
  user: process.env.FIN_DB_USER || 'postgres',
  password: process.env.FIN_DB_PASSWORD || '',
  database: process.env.FIN_DB_NAME || 'financial_db',
  max: 10,
  idleTimeoutMillis: 30_000,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

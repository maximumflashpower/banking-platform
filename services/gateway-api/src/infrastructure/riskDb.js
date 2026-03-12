const { Pool } = require('pg');

const pool = new Pool({
  connectionString:
    process.env.RISK_DATABASE_URL ||
    process.env.RISK_DB_URL ||
    process.env.DATABASE_URL
});

pool.on('error', (err) => {
  console.error('[riskDb] unexpected error on idle client', err);
});

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
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction
};

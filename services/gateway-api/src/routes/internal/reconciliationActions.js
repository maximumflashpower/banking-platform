'use strict';

const express = require('express');
const financialDb = require('../../infrastructure/financialDb');

const router = express.Router();

function parseLimit(raw, fallback = 20) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(n, 100));
}

async function getColumns(tableName) {
  const result = await financialDb.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName]
  );

  return result.rows.map((row) => row.column_name);
}

function pickOrderColumn(columns) {
  if (columns.includes('created_at')) return 'created_at';
  if (columns.includes('updated_at')) return 'updated_at';
  if (columns.includes('id')) return 'id';
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 20);
    const columns = await getColumns('reconciliation_actions');
    const orderColumn = pickOrderColumn(columns);

    const sql = orderColumn
      ? `SELECT * FROM reconciliation_actions ORDER BY ${orderColumn} DESC LIMIT $1`
      : `SELECT * FROM reconciliation_actions LIMIT $1`;

    const result = await financialDb.query(sql, [limit]);

    return res.status(200).json({
      items: result.rows,
      limit,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
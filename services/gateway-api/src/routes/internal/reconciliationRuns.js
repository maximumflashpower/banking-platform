'use strict';

const express = require('express');
const financialDb = require('../../infrastructure/financialDb');

const router = express.Router();

function parseLimit(raw, fallback = 20) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(n, 100));
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  if (columns.includes('started_at')) return 'started_at';
  if (columns.includes('run_date')) return 'run_date';
  if (columns.includes('id')) return 'id';
  return null;
}

function pickRunForeignKey(columns) {
  const candidates = [
    'run_id',
    'reconciliation_run_id',
    'reconciliation_id',
  ];

  return candidates.find((name) => columns.includes(name)) || null;
}

router.get('/', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 20);
    const columns = await getColumns('reconciliation_runs');
    const orderColumn = pickOrderColumn(columns);

    const sql = orderColumn
      ? `SELECT * FROM reconciliation_runs ORDER BY ${orderColumn} DESC LIMIT $1`
      : `SELECT * FROM reconciliation_runs LIMIT $1`;

    const result = await financialDb.query(sql, [limit]);

    return res.status(200).json({
      items: result.rows,
      limit,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'id must be a valid uuid',
      });
    }

    const runResult = await financialDb.query(
      `
        SELECT *
        FROM reconciliation_runs
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    const run = runResult.rows[0];

    if (!run) {
      return res.status(404).json({
        error: 'not_found',
        message: 'reconciliation run not found',
      });
    }

    const itemColumns = await getColumns('reconciliation_items');
    const itemRunFk = pickRunForeignKey(itemColumns);

    let items = [];
    if (itemRunFk) {
      const itemOrderColumn = pickOrderColumn(itemColumns) || 'id';
      const itemsResult = await financialDb.query(
        `SELECT * FROM reconciliation_items WHERE ${itemRunFk} = $1 ORDER BY ${itemOrderColumn} ASC`,
        [id]
      );
      items = itemsResult.rows;
    }

    const actionColumns = await getColumns('reconciliation_actions');
    const actionRunFk = pickRunForeignKey(actionColumns);

    let actions = [];
    if (actionRunFk) {
      const actionOrderColumn = pickOrderColumn(actionColumns) || 'id';
      const actionsResult = await financialDb.query(
        `SELECT * FROM reconciliation_actions WHERE ${actionRunFk} = $1 ORDER BY ${actionOrderColumn} DESC`,
        [id]
      );
      actions = actionsResult.rows;
    }

    return res.status(200).json({
      ...run,
      items,
      actions,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
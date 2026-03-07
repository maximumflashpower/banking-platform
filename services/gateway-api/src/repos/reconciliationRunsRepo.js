'use strict';

async function findRunById(financialDb, runId) {
  const { rows } = await financialDb.query(
    `
      SELECT
        id,
        run_date,
        source_reference,
        status,
        started_at,
        completed_at,
        summary_json,
        created_at,
        updated_at
      FROM reconciliation_runs
      WHERE id = $1
      LIMIT 1
    `,
    [runId]
  );

  return rows[0] || null;
}

async function listItemsByRunId(financialDb, runId) {
  const { rows } = await financialDb.query(
    `
      SELECT *
      FROM reconciliation_items
      WHERE reconciliation_run_id = $1
      ORDER BY created_at ASC, id ASC
    `,
    [runId]
  );

  return rows;
}

function summarizeItems(items) {
  const summary = {
    total_items: 0,
    matched: 0,
    missing_in_ledger: 0,
    missing_in_bank: 0,
    amount_mismatch: 0
  };

  for (const item of items || []) {
    summary.total_items += 1;

    const state = String(item.state || '').toLowerCase();

    if (state === 'matched') summary.matched += 1;
    if (state === 'missing_in_ledger') summary.missing_in_ledger += 1;
    if (state === 'missing_in_bank') summary.missing_in_bank += 1;
    if (state === 'amount_mismatch') summary.amount_mismatch += 1;
  }

  return summary;
}

module.exports = {
  findRunById,
  listItemsByRunId,
  summarizeItems
};

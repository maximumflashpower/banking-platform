'use strict';

async function listRuns(financialDb, { limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));

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
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return rows;
}

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
    ORDER BY created_at ASC
    `,
    [runId]
  );

  return rows;
}

async function findActionByRunId(financialDb, runId) {
  const { rows } = await financialDb.query(
    `
    SELECT *
    FROM reconciliation_actions
    WHERE reconciliation_run_id = $1
    LIMIT 1
    `,
    [runId]
  );

  return rows[0] || null;
}

async function listActions(financialDb, { limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));

  const { rows } = await financialDb.query(
    `
    SELECT
      id,
      reconciliation_run_id,
      severity,
      should_create_case,
      should_alert,
      should_freeze,
      freeze_requested,
      case_id,
      financial_inbox_message_id,
      summary_json,
      created_at,
      updated_at
    FROM reconciliation_actions
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [safeLimit]
  );

  return rows;
}

module.exports = {
  listRuns,
  findRunById,
  listItemsByRunId,
  findActionByRunId,
  listActions
};
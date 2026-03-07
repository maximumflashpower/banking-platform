'use strict';

async function findByRunId(financialDb, runId) {
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

async function create(financialDb, {
  reconciliationRunId,
  severity,
  shouldCreateCase,
  shouldAlert,
  shouldFreeze,
  freezeRequested = false,
  summaryJson = {}
}) {
  const { rows } = await financialDb.query(
    `
      INSERT INTO reconciliation_actions (
        reconciliation_run_id,
        severity,
        should_create_case,
        should_alert,
        should_freeze,
        freeze_requested,
        summary_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (reconciliation_run_id) DO NOTHING
      RETURNING *
    `,
    [
      reconciliationRunId,
      severity,
      shouldCreateCase,
      shouldAlert,
      shouldFreeze,
      freezeRequested,
      JSON.stringify(summaryJson || {})
    ]
  );

  return rows[0] || null;
}

async function updateCaseId(financialDb, runId, caseId) {
  await financialDb.query(
    `
      UPDATE reconciliation_actions
      SET case_id = $2
      WHERE reconciliation_run_id = $1
    `,
    [runId, caseId]
  );
}

async function updateFinancialInboxMessageId(financialDb, runId, messageId) {
  await financialDb.query(
    `
      UPDATE reconciliation_actions
      SET financial_inbox_message_id = $2
      WHERE reconciliation_run_id = $1
    `,
    [runId, messageId]
  );
}

async function markFreezeRequested(financialDb, runId) {
  await financialDb.query(
    `
      UPDATE reconciliation_actions
      SET freeze_requested = TRUE
      WHERE reconciliation_run_id = $1
    `,
    [runId]
  );
}

module.exports = {
  findByRunId,
  create,
  updateCaseId,
  updateFinancialInboxMessageId,
  markFreezeRequested
};

'use strict';

const reconciliationActionsRepo = require('../../repos/reconciliationActionsRepo');
const reconciliationRunsRepo = require('../../repos/reconciliationRunsRepo');
const { evaluateReconciliationSeverity, buildActions } = require('./escalationPolicy');
const { createReconciliationMismatchCase } = require('./createReconciliationMismatchCase');
const { createFinancialInboxAlert } = require('./createFinancialInboxAlert');
const { publishOpsRiskHooks } = require('./publishOpsRiskHooks');

async function processReconciliationRun({ financialDb, caseDb, runId, summary: routeSummary }) {
  const existing = await reconciliationActionsRepo.findByRunId(financialDb, runId);
  if (existing) {
    return {
      skipped: true,
      reason: 'already_processed',
      action: existing
    };
  }

  const run = await reconciliationRunsRepo.findRunById(financialDb, runId);
  if (!run) {
    throw new Error(`reconciliation run not found: ${runId}`);
  }

  const items = await reconciliationRunsRepo.listItemsByRunId(financialDb, runId);
  const itemSummary = reconciliationRunsRepo.summarizeItems(items);

  const mergedSummary = {
    ...(run.summary_json || {}),
    ...(itemSummary || {}),
    ...(routeSummary || {})
  };

  const { severity, reason } = evaluateReconciliationSeverity(mergedSummary);
  const actionFlags = buildActions({ severity, summary: mergedSummary });

  const createdAction = await reconciliationActionsRepo.create(financialDb, {
    reconciliationRunId: runId,
    severity,
    shouldCreateCase: actionFlags.shouldCreateCase,
    shouldAlert: actionFlags.shouldAlert,
    shouldFreeze: actionFlags.shouldFreeze,
    freezeRequested: false,
    summaryJson: {
      ...mergedSummary,
      policy_reason: reason
    }
  });

  const action =
    createdAction ||
    (await reconciliationActionsRepo.findByRunId(financialDb, runId));

  let caseRecord = null;
  if (actionFlags.shouldCreateCase) {
    try {
      caseRecord = await createReconciliationMismatchCase({
        caseDb,
        runId,
        severity,
        priority: actionFlags.priority,
        summary: mergedSummary
      });

      if (caseRecord && caseRecord.id) {
        await reconciliationActionsRepo.updateCaseId(financialDb, runId, caseRecord.id);
      }
    } catch (err) {
      console.error('[reconciliation 4d] case creation failed', err);
    }
  }

  let inboxRecord = null;
  if (actionFlags.shouldAlert) {
    try {
      inboxRecord = await createFinancialInboxAlert({
        financialDb,
        runId,
        severity,
        caseId: caseRecord && caseRecord.id,
        summary: mergedSummary
      });

      if (inboxRecord && inboxRecord.id) {
        await reconciliationActionsRepo.updateFinancialInboxMessageId(
          financialDb,
          runId,
          inboxRecord.id
        );
      }
    } catch (err) {
      console.error('[reconciliation 4d] inbox alert failed', err);
    }
  }

  try {
    await publishOpsRiskHooks({
      runId,
      severity,
      summary: mergedSummary,
      caseRecord,
      inboxRecord,
      shouldFreeze: actionFlags.shouldFreeze
    });
  } catch (err) {
    console.error('[reconciliation 4d] ops/risk hooks failed', err);
  }

  if (actionFlags.shouldFreeze) {
    try {
      await reconciliationActionsRepo.markFreezeRequested(financialDb, runId);
    } catch (err) {
      console.error('[reconciliation 4d] freeze mark failed', err);
    }
  }

  return {
    skipped: false,
    runId,
    severity,
    reason,
    caseId: caseRecord && caseRecord.id,
    financialInboxMessageId: inboxRecord && inboxRecord.id,
    shouldFreeze: actionFlags.shouldFreeze,
    summary: mergedSummary,
    action
  };
}

module.exports = {
  processReconciliationRun
};

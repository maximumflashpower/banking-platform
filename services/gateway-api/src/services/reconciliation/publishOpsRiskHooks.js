'use strict';

async function publishOpsRiskHooks({
  runId,
  severity,
  summary,
  caseRecord,
  inboxRecord,
  shouldFreeze
}) {
  const hookSummary = {
    run_id: runId,
    severity,
    should_freeze: Boolean(shouldFreeze),
    case_id: caseRecord && caseRecord.id ? caseRecord.id : null,
    financial_inbox_message_id: inboxRecord && inboxRecord.id ? inboxRecord.id : null,
    summary: summary || {}
  };

  console.log('[reconciliation 4d] ops/risk hooks stub', JSON.stringify(hookSummary));
  return hookSummary;
}

module.exports = {
  publishOpsRiskHooks
};

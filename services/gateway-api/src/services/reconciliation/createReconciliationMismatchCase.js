'use strict';

const crypto = require('crypto');

const SYSTEM_ACTOR_UUID = '00000000-0000-0000-0000-000000000000';

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function buildPriority(severity) {
  switch (severity) {
    case 'critical':
      return 'urgent';
    case 'high':
      return 'high';
    case 'medium':
      return 'normal';
    default:
      return 'low';
  }
}

async function createReconciliationMismatchCase({ caseDb, runId, severity, summary }) {
  const idempotencyKey = `reconciliation-case:${runId}`;
  const dedupeKey = `reconciliation-run:${runId}`;
  const correlationId = `reconciliation-run:${runId}`;

  const replay = await caseDb.query(
    `
    SELECT id, case_number, state
    FROM cases
    WHERE idempotency_key = $1
       OR dedupe_key = $2
    LIMIT 1
    `,
    [idempotencyKey, dedupeKey]
  );

  if (replay.rowCount > 0) {
    return replay.rows[0];
  }

  const caseId = uuid();
  const timelineId = uuid();

  const title = `Reconciliation mismatch detected for run ${runId}`;
  const textSummary = `Automatic case created from reconciliation discrepancies. Severity=${severity}.`;

  const result = await caseDb.withTransaction(async (client) => {
    await client.query(
      `
      INSERT INTO cases (
        id,
        domain,
        origin,
        state,
        priority,
        severity,
        title,
        summary,
        business_id,
        user_id,
        source_system,
        source_reference,
        external_object_type,
        external_object_id,
        dedupe_key,
        idempotency_key,
        correlation_id,
        request_id,
        created_by,
        updated_by
      )
      VALUES (
        $1,
        'operations',
        'reconciliation_mismatch',
        'open',
        $2,
        $3,
        $4,
        $5,
        NULL,
        NULL,
        'ledger_reconciliation',
        $6,
        'reconciliation_run',
        $6,
        $7,
        $8,
        $9,
        NULL,
        $10::uuid,
        $10::uuid
      )
      `,
      [
        caseId,
        buildPriority(severity),
        severity,
        title,
        textSummary,
        runId,
        dedupeKey,
        idempotencyKey,
        correlationId,
        SYSTEM_ACTOR_UUID
      ]
    );

    await client.query(
      `
      INSERT INTO case_timeline (
        id,
        case_id,
        event_type,
        to_state,
        actor_type,
        actor_id,
        visible_to_customer,
        entry_text,
        metadata,
        idempotency_key,
        correlation_id,
        request_id
      )
      VALUES (
        $1,
        $2,
        'case_created',
        'open',
        'system',
        NULL,
        false,
        $3,
        $4::jsonb,
        $5,
        $6,
        NULL
      )
      `,
      [
        timelineId,
        caseId,
        `Case created automatically from reconciliation run ${runId}`,
        JSON.stringify({
          reconciliation_run_id: runId,
          severity,
          summary: summary || {}
        }),
        `${idempotencyKey}:timeline:case_created`,
        correlationId
      ]
    );

    const created = await client.query(
      `
      SELECT id, case_number, domain, origin, state, priority, severity, title, summary
      FROM cases
      WHERE id = $1
      `,
      [caseId]
    );

    return created.rows[0];
  });

  return result;
}

module.exports = {
  createReconciliationMismatchCase
};
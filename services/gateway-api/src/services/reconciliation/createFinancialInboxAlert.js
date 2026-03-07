'use strict';

const crypto = require('crypto');

function buildDeterministicUuid(input) {
  const hash = crypto.createHash('sha256').update(String(input)).digest('hex');
  const part1 = hash.slice(0, 8);
  const part2 = hash.slice(8, 12);
  const part3 = `4${hash.slice(13, 16)}`;
  const variantNibble = (parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8;
  const part4 = `${variantNibble.toString(16)}${hash.slice(17, 20)}`;
  const part5 = hash.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

async function createFinancialInboxAlert({ financialDb, runId, severity, caseId, summary }) {
  const messageId = buildDeterministicUuid(`reconciliation-inbox:${runId}`);
  const correlationId = `reconciliation-run:${runId}`;
  const payload = {
    category: 'reconciliation',
    run_id: runId,
    severity,
    case_id: caseId || null,
    summary: summary || {}
  };

  const { rows } = await financialDb.query(
    `
      INSERT INTO ops.financial_inbox_messages (
        id,
        space_uuid,
        type,
        payload,
        correlation_id
      )
      VALUES (
        $1,
        '00000000-0000-0000-0000-000000000000'::uuid,
        $2,
        $3::jsonb,
        $4
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id, space_uuid, type, payload, correlation_id, created_at
    `,
    [messageId, 'reconciliation_mismatch', JSON.stringify(payload), correlationId]
  );

  if (rows[0]) {
    return rows[0];
  }

  const existing = await financialDb.query(
    `
      SELECT id, space_uuid, type, payload, correlation_id, created_at
      FROM ops.financial_inbox_messages
      WHERE id = $1
      LIMIT 1
    `,
    [messageId]
  );

  return existing.rows[0] || { id: messageId };
}

module.exports = {
  createFinancialInboxAlert
};

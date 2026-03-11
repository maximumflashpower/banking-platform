'use strict';

function mapRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    spaceId: row.space_id,
    cardId: row.card_id,
    authorizationId: row.authorization_id,
    captureId: row.capture_id,
    settlementId: row.settlement_id,
    reasonCode: row.reason_code,
    description: row.description,
    status: row.status,
    caseId: row.case_id,
    inboxMessageId: row.inbox_message_id,
    openedByUserId: row.opened_by_user_id,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    requestPayload: row.request_payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findById(client, id) {
  const result = await client.query(
    `
      SELECT *
      FROM card_disputes
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return mapRow(result.rows[0]);
}

async function findByIdempotencyKey(client, idempotencyKey) {
  const result = await client.query(
    `
      SELECT *
      FROM card_disputes
      WHERE idempotency_key = $1
      LIMIT 1
    `,
    [idempotencyKey]
  );

  return mapRow(result.rows[0]);
}

async function createDispute(client, input) {
  const {
    id,
    spaceId,
    cardId,
    authorizationId,
    captureId,
    settlementId,
    reasonCode,
    description,
    openedByUserId,
    idempotencyKey,
    correlationId,
    requestPayload,
  } = input;

  const result = await client.query(
    `
      INSERT INTO card_disputes (
        id,
        space_id,
        card_id,
        authorization_id,
        capture_id,
        settlement_id,
        reason_code,
        description,
        status,
        case_id,
        inbox_message_id,
        opened_by_user_id,
        idempotency_key,
        correlation_id,
        request_payload
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        'opened',
        NULL,
        NULL,
        $9, $10, $11, $12::jsonb
      )
      RETURNING *
    `,
    [
      id,
      spaceId,
      cardId,
      authorizationId,
      captureId,
      settlementId,
      reasonCode,
      description,
      openedByUserId,
      idempotencyKey,
      correlationId,
      JSON.stringify(requestPayload || {}),
    ]
  );

  return mapRow(result.rows[0]);
}

async function attachCase(client, { disputeId, caseId }) {
  const result = await client.query(
    `
      UPDATE card_disputes
      SET case_id = $2,
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [disputeId, caseId]
  );

  return mapRow(result.rows[0]);
}

async function attachInboxMessage(client, { disputeId, inboxMessageId }) {
  const result = await client.query(
    `
      UPDATE card_disputes
      SET inbox_message_id = $2,
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [disputeId, inboxMessageId]
  );

  return mapRow(result.rows[0]);
}

module.exports = {
  findById,
  findByIdempotencyKey,
  createDispute,
  attachCase,
  attachInboxMessage,
};